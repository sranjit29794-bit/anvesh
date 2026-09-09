import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let widthClass = 'max-w-md';
  switch (maxWidth) {
    case 'sm':
      widthClass = 'max-w-sm';
      break;
    case 'md':
      widthClass = 'max-w-md';
      break;
    case 'lg':
      widthClass = 'max-w-lg';
      break;
    case 'xl':
      widthClass = 'max-w-xl';
      break;
    case '2xl':
      widthClass = 'max-w-2xl';
      break;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative w-full ${widthClass} bg-bg-card border border-border-strong rounded-card shadow-2xl z-10 overflow-hidden flex flex-col my-auto`}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <h3 id="modal-title" className="text-h3 font-semibold text-text-primary">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-text-secondary mt-1">{subtitle}</p>
            )}
          </div>
          <Button
            variant="icon"
            size="sm"
            onClick={onClose}
            aria-label="Close modal"
            className="text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[75vh] overflow-y-auto text-body text-text-secondary">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-bg-secondary">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
