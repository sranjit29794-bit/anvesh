import React, { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    // Base styles with 8px radius
    let baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent-primary/40 disabled:opacity-50 disabled:cursor-not-allowed select-none';

    // Variant styles
    let variantStyles = '';
    switch (variant) {
      case 'primary':
        variantStyles = 'bg-accent-primary text-white hover:bg-accent-primary-hover active:scale-[0.99] shadow-sm';
        break;
      case 'secondary':
        variantStyles =
          'bg-bg-elevated text-text-secondary border border-border hover:border-accent-primary hover:text-text-primary active:scale-[0.99]';
        break;
      case 'danger':
        variantStyles = 'bg-accent-danger text-white hover:bg-[#D03535] active:scale-[0.99] shadow-sm';
        break;
      case 'ghost':
        variantStyles = 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-elevated';
        break;
      case 'icon':
        variantStyles =
          'w-8 h-8 p-0 bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-[6px]';
        break;
    }

    // Size styles (unless icon variant)
    let sizeStyles = '';
    if (variant !== 'icon') {
      switch (size) {
        case 'sm':
          sizeStyles = 'h-8 px-3 text-xs rounded-btn gap-1.5';
          break;
        case 'md':
          sizeStyles = 'h-9 px-4 text-body rounded-btn gap-2';
          break;
        case 'lg':
          sizeStyles = 'h-11 px-5 text-h3 rounded-btn gap-2.5';
          break;
      }
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        {children}
        {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
