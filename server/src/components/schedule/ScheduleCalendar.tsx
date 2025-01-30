'use client'

import React, { useState, useEffect, useCallback, MouseEvent } from 'react';
import { Calendar, momentLocalizer, NavigateAction, View } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Button } from '../ui/Button';
import EntryPopup from './EntryPopup';
import { CalendarStyleProvider } from './CalendarStyleProvider';
import { getCurrentUserScheduleEntries, addScheduleEntry, updateScheduleEntry, deleteScheduleEntry } from '@/lib/actions/scheduleActions';
import { IScheduleEntry } from '@/interfaces/schedule.interfaces';
import { produce } from 'immer';
import { Dialog } from '@radix-ui/react-dialog';
import { WorkItemType, IExtendedWorkItem } from '@/interfaces/workItem.interfaces';
import { useUsers } from '@/hooks/useUsers';
import { getCurrentUser } from '@/lib/actions/user-actions/userActions';
import { IUserWithRoles } from '@/interfaces/auth.interfaces';
import { WorkItemDrawer } from '@/components/time-management/time-entry/time-sheet/WorkItemDrawer';
import { useDrawer } from '@/context/DrawerContext';

const localizer = momentLocalizer(moment);

const DnDCalendar = withDragAndDrop(Calendar);

const ScheduleCalendar: React.FC = () => {
  const [view, setView] = useState<View>("week");
  const [events, setEvents] = useState<IScheduleEntry[]>([]);
  const [showEntryPopup, setShowEntryPopup] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<IScheduleEntry | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const { openDrawer, closeDrawer } = useDrawer();

  const workItemColors: Record<WorkItemType, string> = {
    ticket: 'rgb(var(--color-primary-200))',
    project_task: 'rgb(var(--color-secondary-100))',
    non_billable_category: 'rgb(var(--color-accent-100))',
    ad_hoc: 'rgb(var(--color-border-200))'
  };

  const workItemHoverColors: Record<WorkItemType, string> = {
    ticket: 'rgb(var(--color-primary-200))',
    project_task: 'rgb(var(--color-secondary-200))',
    non_billable_category: 'rgb(var(--color-accent-200))',
    ad_hoc: 'rgb(var(--color-border-300))'
  };

  const Legend = () => (
    <div className="flex justify-center space-x-4 mb-4 p-2 rounded-lg bg-opacity-50">
      {Object.entries(workItemColors).map(([type, color]): JSX.Element => (
        <div key={type} className="flex items-center">
          <div
            className="w-4 h-4 mr-2 rounded"
            style={{ backgroundColor: color }}
          ></div>
          <span className="capitalize text-sm font-medium text-[rgb(var(--color-text-900))]">
            {type === 'ad_hoc' ? 'Ad-hoc Entry' : type.replace('_', ' ')}
          </span>
        </div>
      ))}
    </div>
  );

  const { users, loading: usersLoading, error: usersError } = useUsers();
  const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);

  // Fetch current user's roles on mount
  useEffect(() => {
    async function fetchUserRoles() {
      const user = await getCurrentUser();
      if (user?.roles) {
        setCurrentUserRoles(user.roles.map((role): string => role.role_name));
      }
    }
    fetchUserRoles();
  }, []);

  // Check if user can assign multiple agents
  const canAssignMultipleAgents = currentUserRoles.some((role: string) => 
    ['admin', 'manager'].includes(role.toLowerCase())
  );

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    // Calculate date range based on current view
    let rangeStart, rangeEnd;
    
    if (view === 'month') {
      // For month view, include the entire visible range (which might span multiple months)
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      // Adjust for days from previous/next month that are visible
      rangeStart = new Date(firstDay);
      rangeStart.setDate(1 - firstDay.getDay()); // Start from the first day of the week
      
      rangeEnd = new Date(lastDay);
      rangeEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay())); // End on the last day of the week
      
      // Set times to include full days
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd.setHours(23, 59, 59, 999);
    } else {
      // For week/day views, use the exact visible range
      rangeStart = new Date(date);
      rangeEnd = new Date(date);
      
      if (view === 'week') {
        rangeStart.setDate(date.getDate() - date.getDay());
        rangeEnd.setDate(rangeStart.getDate() + 6);
      }
      
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd.setHours(23, 59, 59, 999);
    }
    
    console.log('Fetching schedule entries:', { 
      view,
      rangeStart: rangeStart.toISOString(), 
      rangeEnd: rangeEnd.toISOString() 
    });
    
    const result = await getCurrentUserScheduleEntries(rangeStart, rangeEnd);
    if (result.success) {
      console.log('Fetched entries:', {
        count: result.entries.length,
        entries: result.entries.map((e): { id: string; title: string; type: string; start: string; end: string } => ({
          id: e.entry_id,
          title: e.title,
          type: e.work_item_type,
          start: new Date(e.scheduled_start).toISOString(),
          end: new Date(e.scheduled_end).toISOString()
        }))
      });
      setEvents(result.entries);
    } else {
      console.error('Failed to fetch schedule entries:', result.error);
      setError(result.error || 'An unknown error occurred');
    }
    setIsLoading(false);
  }, [date, view]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSelectSlot = (slotInfo: any) => {
    setSelectedSlot(slotInfo);
    setShowEntryPopup(true);
  };

  const handleSelectEvent = (event: object, e: React.SyntheticEvent<HTMLElement>) => {
    const scheduleEvent = event as IScheduleEntry;
    const target = e.target as HTMLElement;
    const isTicketOrTask = scheduleEvent.work_item_type === 'ticket' || scheduleEvent.work_item_type === 'project_task';
    
    // If it's a title click on a ticket or project task, open the drawer
    if (target.classList.contains('event-title') && isTicketOrTask) {
      e.stopPropagation(); // Prevent EntryPopup from opening
      const workItem = {
        work_item_id: scheduleEvent.work_item_id || '',
        type: scheduleEvent.work_item_type,
        name: scheduleEvent.title,
        title: scheduleEvent.title,
        description: scheduleEvent.notes || '',
        startTime: new Date(scheduleEvent.scheduled_start),
        endTime: new Date(scheduleEvent.scheduled_end),
        scheduled_start: new Date(scheduleEvent.scheduled_start).toISOString(),
        scheduled_end: new Date(scheduleEvent.scheduled_end).toISOString(),
        users: scheduleEvent.assigned_user_ids.map(id => ({ user_id: id })),
        tenant: scheduleEvent.tenant,
        is_billable: true 
      } as IExtendedWorkItem;

      openDrawer(
        <div className="h-full">
          <WorkItemDrawer
            workItem={workItem}
            onClose={closeDrawer}
            onTaskUpdate={handleTaskUpdate}
            onScheduleUpdate={handleScheduleUpdate}
          />
        </div>
      );
    } else {
      // For non-title clicks or non-ticket/task items, show the EntryPopup
      setSelectedEvent(scheduleEvent);
      setShowEntryPopup(true);
    }
  };

  const handleEntryPopupClose = () => {
    setShowEntryPopup(false);
    setSelectedEvent(null);
    setSelectedSlot(null);
  };

  const handleTaskUpdate = async (updated: any) => {
    await fetchEvents(); // Refresh events after task update
  };

  const handleScheduleUpdate = async (updated: any) => {
    await fetchEvents(); // Refresh events after schedule update
  };

  const handleEntryPopupSave = async (entryData: IScheduleEntry) => {
    try {
      console.log('Saving entry:', entryData);
      let updatedEntry;
      if (selectedEvent) {
        // Ensure we're using the correct entry ID and maintaining virtual instance relationship
        const entryToUpdate = {
          ...entryData,
          recurrence_pattern: entryData.recurrence_pattern || null,
          assigned_user_ids: entryData.assigned_user_ids,
          // Only preserve original_entry_id if this is actually a virtual instance
          ...(selectedEvent.entry_id.includes('_') ? { original_entry_id: selectedEvent.original_entry_id } : {})
        };
        
        // Use the virtual instance's ID if it exists, otherwise use the master entry's ID
        const entryId = selectedEvent.entry_id;
        const result = await updateScheduleEntry(entryId, entryToUpdate);
        if (result.success && result.entry) {
          updatedEntry = result.entry;
          console.log('Updated entry:', updatedEntry);
        } else {
          console.error('Failed to update entry:', result.error);
          alert('Failed to update schedule entry: ' + result.error);
          return;
        }
      } else {
        const result = await addScheduleEntry({
          ...entryData,
          recurrence_pattern: entryData.recurrence_pattern || null,
        });
        if (result.success && result.entry) {
          updatedEntry = result.entry;
          console.log('Added new entry:', updatedEntry);
        } else {
          console.error('Failed to add entry:', result.error);
          alert('Failed to add schedule entry: ' + result.error);
          return;
        }
      }

      if (updatedEntry) {
        // Always refresh events to ensure we have the latest data
        await fetchEvents();
      }

      setShowEntryPopup(false);
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error saving schedule entry:', error);
      alert('An error occurred while saving the schedule entry');
    }
  };

  // Pass canAssignMultipleAgents to EntryPopup
  const renderEntryPopup = () => {
    if (!showEntryPopup) return null;
    return (
      <EntryPopup
        event={selectedEvent}
        slot={selectedSlot}
        onClose={handleEntryPopupClose}
        onSave={handleEntryPopupSave}
        canAssignMultipleAgents={canAssignMultipleAgents}
        users={usersLoading ? [] : (users || [])}
        loading={usersLoading}
        error={usersError}
      />
    );
  };

  const handleNavigate = useCallback((newDate: Date, view: View, action: NavigateAction) => {
    const navigateAction = action === 'PREV' ? 'PREV' : action === 'NEXT' ? 'NEXT' : 'TODAY';
    setDate(newDate);
  }, []);

  const goToToday = () => {
    setDate(new Date());
  };

  const goBack = () => {
    const newDate = new Date(date);
    if (view === 'month') {
      newDate.setMonth(date.getMonth() - 1);
    } else {
      newDate.setDate(date.getDate() - 7);
    }
    setDate(newDate);
  };

  const goNext = () => {
    const newDate = new Date(date);
    if (view === 'month') {
      newDate.setMonth(date.getMonth() + 1);
    } else {
      newDate.setDate(date.getDate() + 7);
    }
    setDate(newDate);
  };

  const updateEventLocally = (updatedEvent: IScheduleEntry) => {
    setEvents(produce(draft => {
      const index = draft.findIndex(e => e.entry_id === updatedEvent.entry_id);
      if (index !== -1) {
        draft[index] = updatedEvent;
      }
    }));
  };

  const handleEventResize = async ({ event, start, end }: any) => {
    const updatedEvent = { 
      ...event, 
      scheduled_start: start, 
      scheduled_end: end,
      assigned_user_ids: event.assigned_user_ids, // Preserve assigned users
      // Only preserve original_entry_id if this is a virtual instance
      ...(event.entry_id.includes('_') ? { original_entry_id: event.original_entry_id } : {})
    };
    
    // Update locally first for immediate feedback
    updateEventLocally(updatedEvent);
    
    // Update in the database
    const result = await updateScheduleEntry(event.entry_id, updatedEvent);
    
    // If this is a recurring entry or was a recurring entry, refresh all events
    if (result.success && result.entry && (result.entry.recurrence_pattern || event.recurrence_pattern)) {
      await fetchEvents();
    }
  };

  const handleEventDrop = async ({ event, start, end }: any) => {
    const updatedEvent = { 
      ...event, 
      scheduled_start: start, 
      scheduled_end: end,
      assigned_user_ids: event.assigned_user_ids, // Preserve assigned users
      // Only preserve original_entry_id if this is a virtual instance
      ...(event.entry_id.includes('_') ? { original_entry_id: event.original_entry_id } : {})
    };
    
    // Update locally first for immediate feedback
    updateEventLocally(updatedEvent);
    
    // Update in the database
    const result = await updateScheduleEntry(event.entry_id, updatedEvent);
    
    // If this is a recurring entry or was a recurring entry, refresh all events
    if (result.success && result.entry && (result.entry.recurrence_pattern || event.recurrence_pattern)) {
      await fetchEvents();
    }
  };

  const eventStyleGetter = (event: IScheduleEntry) => {
    const style: React.CSSProperties = {
      backgroundColor: workItemColors[event.work_item_type],
      borderRadius: '6px',
      opacity: 1,
      color: 'rgb(var(--color-text-900))',
      border: 'none',
      padding: '2px 5px',
      fontWeight: 500,
      fontSize: '0.875rem',
      transition: 'background-color 0.2s'
    };

    return {
      style,
      className: 'hover:bg-[' + workItemHoverColors[event.work_item_type] + ']'
    };
  };

  const EventWrapper = ({ event: calendarEvent, children }: { event: object; children?: React.ReactNode }) => {
    const event = calendarEvent as IScheduleEntry;
    const isTicketOrTask = event.work_item_type === 'ticket' || event.work_item_type === 'project_task';
    
    return (
      <div style={{ height: '100%' }}>
        <div className="flex flex-col h-full">
          <div className={`event-title ${isTicketOrTask ? 'cursor-pointer hover:underline' : ''}`}>
            {event.title}
          </div>
          <div className="flex-1">
            {children}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col">
      <CalendarStyleProvider />
      <Legend />
      <div className="flex-grow">
        <DnDCalendar
          localizer={localizer}
          events={events}
          startAccessor={(event: object) => new Date((event as IScheduleEntry).scheduled_start)}
          endAccessor={(event: object) => new Date((event as IScheduleEntry).scheduled_end)}
          titleAccessor={(event: object) => (event as IScheduleEntry).title}
          eventPropGetter={(event: object) => eventStyleGetter(event as IScheduleEntry)}
          style={{ height: '100%' }}
          view={view}
          date={date}
          onView={(newView) => setView(newView)}
          onNavigate={handleNavigate}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          resizable
          onEventResize={handleEventResize}
          onEventDrop={handleEventDrop}
          step={30}
          timeslots={2}
          components={{
            event: EventWrapper
          }}
        />
      </div>
      <Dialog open={showEntryPopup} onOpenChange={setShowEntryPopup}>
        {renderEntryPopup()}
      </Dialog>
    </div>
  );
};

export default ScheduleCalendar;
