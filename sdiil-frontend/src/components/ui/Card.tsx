import React, { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  ...props
}) => {
  let bgStyles = 'bg-bg-card border border-border';
  if (variant === 'elevated') {
    bgStyles = 'bg-bg-elevated border border-border-strong shadow-lg';
  } else if (variant === 'bordered') {
    bgStyles = 'bg-transparent border border-border';
  }

  let paddingStyles = '';
  switch (padding) {
    case 'none':
      paddingStyles = 'p-0';
      break;
    case 'sm':
      paddingStyles = 'p-3 sm:p-4';
      break;
    case 'md':
      paddingStyles = 'p-4 sm:p-6';
      break;
    case 'lg':
      paddingStyles = 'p-6 sm:p-8';
      break;
  }

  return (
    <div
      className={`rounded-card transition-colors duration-150 ${bgStyles} ${paddingStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
