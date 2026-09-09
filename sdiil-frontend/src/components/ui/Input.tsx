import React, { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-label text-text-secondary font-medium tracking-wider"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 text-text-muted pointer-events-none flex items-center justify-center">
              {leftIcon}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            className={`w-full bg-bg-elevated text-text-primary placeholder:text-text-muted border rounded-input text-body transition-colors duration-150 py-2 ${
              leftIcon ? 'pl-9' : 'pl-3'
            } ${rightIcon ? 'pr-9' : 'pr-3'} ${
              error
                ? 'border-accent-danger focus:border-accent-danger focus:ring-1 focus:ring-accent-danger'
                : 'border-border focus:border-accent-primary focus:ring-1 focus:ring-accent-primary'
            } disabled:opacity-50 disabled:cursor-not-allowed outline-none ${className}`}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 text-text-muted flex items-center justify-center">
              {rightIcon}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-accent-danger font-medium">{error}</p>}
        {!error && helperText && (
          <p className="text-xs text-text-muted">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
