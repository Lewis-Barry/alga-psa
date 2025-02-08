import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './Dialog';
import { Button } from './Button';
import { useRegisterUIComponent } from '../../types/ui-reflection/useRegisterUIComponent';
import { DialogComponent, ButtonComponent, AutomationProps } from '../../types/ui-reflection/types';
import { withDataAutomationId } from '../../types/ui-reflection/withDataAutomationId';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedValue?: string) => Promise<void> | void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  options?: Array<{ value: string; label: string }>;
  id?: string;
  className?: string;
  dialogClassName?: string;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps & AutomationProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isConfirming,
  options,
  id,
  className
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedValue, setSelectedValue] = useState('');

  useEffect(() => {
    if (options?.[0]?.value) {
      setSelectedValue(options[0].value);
    }
  }, [options]);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm(options ? selectedValue : undefined);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog 
      isOpen={isOpen} 
      onClose={onClose}
      id={id}
      title={title}
      className={className}
    >
      <DialogContent>
        <p className="text-gray-600">{message}</p>
        {options && (
          <div className="space-y-2 mt-4">
            {options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dialog-option"
                  value={opt.value}
                  checked={selectedValue === opt.value}
                  onChange={(e) => setSelectedValue(e.target.value)}
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
                  id={`${id}-option-${opt.value}`}
                />
                {opt.label}
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <div className="mt-4 space-x-2">
          <Button 
            variant="outline" 
            onClick={onClose}
            id={`${id}-cancel`}
          >
            {cancelLabel}
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={isConfirming || isProcessing}
            id={`${id}-confirm`}
          >
            {confirmLabel}
          </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
