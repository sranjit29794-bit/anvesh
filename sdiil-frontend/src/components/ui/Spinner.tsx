import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className = '' }) => {
  let sizeClass = 'w-5 h-5 border-2';
  if (size === 'sm') sizeClass = 'w-4 h-4 border-2';
  if (size === 'lg') sizeClass = 'w-8 h-8 border-3';

  return (
    <div
      className={`inline-block border-accent-primary border-t-transparent rounded-full animate-spin ${sizeClass} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
};
