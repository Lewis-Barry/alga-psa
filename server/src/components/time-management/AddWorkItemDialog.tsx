'use client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { IWorkItem } from '@/interfaces/workItem.interfaces';
import { WorkItemPicker } from './WorkItemPicker';

interface AddWorkItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (workItem: IWorkItem) => void;
  existingWorkItems: IWorkItem[];
}

export function AddWorkItemDialog({ isOpen, onClose, onAdd, existingWorkItems }: AddWorkItemDialogProps) {
  const handleSelect = (workItem: IWorkItem) => {
    onAdd(workItem);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <DialogContent>
        <div className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Work Item</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <WorkItemPicker 
              onSelect={handleSelect} 
              existingWorkItems={existingWorkItems}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
