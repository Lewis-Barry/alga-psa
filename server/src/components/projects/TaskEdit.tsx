'use client';

import { useEffect, useState } from 'react';
import { IProjectPhase, IProjectTask } from '@/interfaces/project.interfaces';
import { IUserWithRoles } from '@/interfaces/auth.interfaces';
import { getProjectTaskStatuses, ProjectStatus } from '@/lib/actions/projectActions';
import TaskForm from './TaskForm';

interface TaskEditProps {
  task: IProjectTask;
  phase: IProjectPhase;  // Added this prop
  phases?: IProjectPhase[];
  onClose: () => void;
  onTaskUpdated: (updatedTask: IProjectTask | null) => void;
  projectStatuses?: ProjectStatus[];  // Made optional since we fetch it
  users: IUserWithRoles[];
}

export default function TaskEdit({ 
  task, 
  phase,  // Added this prop
  onClose, 
  onTaskUpdated,
  phases,
  projectStatuses: initialStatuses,
  users 
}: TaskEditProps): JSX.Element {
  const [statuses, setStatuses] = useState<ProjectStatus[]>(initialStatuses || []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!initialStatuses) {
          const projectStatuses = await getProjectTaskStatuses(phase.project_id);
          setStatuses(projectStatuses);
        }
      } catch (error) {
        console.error('Error fetching task details:', error);
      }
    };
    fetchData();
  }, [phase.project_id, initialStatuses]);

  return (
    <TaskForm
      task={task}
      phase={phase}
      phases={phases}
      onClose={onClose}
      onSubmit={onTaskUpdated}
      projectStatuses={statuses}
      defaultStatus={statuses.find(s => s.project_status_mapping_id === task.project_status_mapping_id)}
      users={users}
      mode="edit"
    />
  );
}
