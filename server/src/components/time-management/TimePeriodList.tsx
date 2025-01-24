import React from 'react';
import { ITimePeriodWithStatus, TimeSheetStatus } from '@/interfaces/timeEntry.interfaces';
import { Button } from '@radix-ui/themes';
import { DataTable } from '@/components/ui/DataTable';
import { ColumnDefinition } from '@/interfaces/dataTable.interfaces';

interface TimePeriodListProps {
  timePeriods: ITimePeriodWithStatus[];
  onSelectTimePeriod: (timePeriod: ITimePeriodWithStatus) => void;
}

const getStatusDisplay = (status: TimeSheetStatus): { text: string; color: string } => {
  switch (status) {
    case 'DRAFT':
      return { text: 'In Progress', color: 'blue' };
    case 'SUBMITTED':
      return { text: 'Submitted', color: 'yellow' };
    case 'APPROVED':
      return { text: 'Approved', color: 'green' };
    case 'CHANGES_REQUESTED':
      return { text: 'Changes Requested', color: 'orange' };
    default:
      return { text: 'Unknown', color: 'gray' };
  }
};

export function TimePeriodList({ timePeriods, onSelectTimePeriod }: TimePeriodListProps) {
  const columns: ColumnDefinition<ITimePeriodWithStatus>[] = [
    {
      title: 'Start Date',
      dataIndex: 'start_date',
      width: '25%',
      render: (value) => value.slice(0, 10)
    },
    {
      title: 'End Date', 
      dataIndex: 'end_date',
      width: '25%',
      render: (value) => value.slice(0, 10)
    },
    {
      title: 'Status',
      dataIndex: 'timeSheetStatus',
      width: '25%',
      render: (value: TimeSheetStatus) => {
        const { text, color } = getStatusDisplay(value);
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium bg-${color}-100 text-${color}-800`}>
            {text}
          </span>
        );
      }
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: '25%',
      render: (_, record) => (
        <Button
          id={`view-period-${record.period_id}`}
          onClick={() => onSelectTimePeriod(record)}
          variant="soft"
          color="purple"
        >
          View
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-4 w-full">
      <h2 className="text-2xl font-bold mb-4">Select a Time Period</h2>
      <DataTable
        data={timePeriods}
        columns={columns}
        pagination={false}
      />
    </div>
  );
}
