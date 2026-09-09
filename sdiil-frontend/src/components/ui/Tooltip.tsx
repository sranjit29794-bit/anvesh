import React, { useState } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  let posStyles = '';
  switch (position) {
    case 'top':
      posStyles = 'bottom-full left-1/2 -translate-x-1/2 mb-2';
      break;
    case 'bottom':
      posStyles = 'top-full left-1/2 -translate-x-1/2 mt-2';
      break;
    case 'left':
      posStyles = 'right-full top-1/2 -translate-y-1/2 mr-2';
      break;
    case 'right':
      posStyles = 'left-full top-1/2 -translate-y-1/2 ml-2';
      break;
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible && content && (
        <div
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1.5 text-xs text-text-primary bg-bg-elevated border border-border-strong rounded-md shadow-xl whitespace-nowrap pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95 ${posStyles} ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
};
