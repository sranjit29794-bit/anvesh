import React, { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}) => {
  let variantStyles = '';
  switch (variant) {
    case 'primary':
      variantStyles = 'bg-accent-primary/15 text-accent-primary border-accent-primary/30';
      break;
    case 'success':
      variantStyles = 'bg-accent-success/15 text-accent-success border-accent-success/30';
      break;
    case 'warning':
      variantStyles = 'bg-accent-warning/15 text-accent-warning border-accent-warning/30';
      break;
    case 'danger':
      variantStyles = 'bg-accent-danger/15 text-accent-danger border-accent-danger/30';
      break;
    case 'outline':
      variantStyles = 'bg-transparent text-text-secondary border-border';
      break;
    case 'default':
    default:
      variantStyles = 'bg-bg-elevated text-text-secondary border-border';
      break;
  }

  const sizeStyles = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border tracking-wide uppercase ${variantStyles} ${sizeStyles} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
