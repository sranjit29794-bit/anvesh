import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, Bot } from 'lucide-react';

export interface AlertProps {
  variant?: 'default' | 'info' | 'success' | 'warning' | 'danger' | 'ai-verification';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'default',
  title,
  children,
  className = '',
}) => {
  let styles = 'bg-bg-elevated border-border text-text-secondary';
  let Icon = Info;
  let iconColor = 'text-text-muted';

  switch (variant) {
    case 'info':
      styles = 'bg-accent-primary/10 border-accent-primary/30 text-text-primary';
      Icon = Info;
      iconColor = 'text-accent-primary';
      break;
    case 'success':
      styles = 'bg-accent-success/10 border-accent-success/30 text-text-primary';
      Icon = CheckCircle;
      iconColor = 'text-accent-success';
      break;
    case 'warning':
      styles = 'bg-accent-warning/10 border-accent-warning/30 text-text-primary';
      Icon = AlertTriangle;
      iconColor = 'text-accent-warning';
      break;
    case 'danger':
      styles = 'bg-accent-danger/10 border-accent-danger/30 text-text-primary';
      Icon = AlertCircle;
      iconColor = 'text-accent-danger';
      break;
    case 'ai-verification':
      styles = 'bg-accent-warning/10 border-accent-warning/40 text-text-primary shadow-sm';
      Icon = Bot;
      iconColor = 'text-accent-warning';
      break;
  }

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-3.5 sm:p-4 rounded-card border ${styles} ${className}`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
      <div className="flex-1 text-body">
        {title && <h4 className="text-h3 font-semibold mb-1 text-text-primary">{title}</h4>}
        <div className="text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
};
