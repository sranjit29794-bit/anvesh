import React from 'react';
import { SensitivityLevel } from '@/types/document.types';
import { getSensitivityInfo } from '@/utils/sensitivityColor';

export interface SensitivityBadgeProps {
  level: SensitivityLevel;
  size?: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
  className?: string;
}

export const SensitivityBadge: React.FC<SensitivityBadgeProps> = ({
  level,
  size = 'md',
  showDetails = false,
  className = '',
}) => {
  const info = getSensitivityInfo(level);

  let sizeStyles = 'text-xs px-2.5 py-1';
  let dotSize = 'w-1.5 h-1.5';
  if (size === 'sm') {
    sizeStyles = 'text-[11px] px-2 py-0.5';
    dotSize = 'w-1.5 h-1.5';
  } else if (size === 'lg') {
    sizeStyles = 'text-sm px-3.5 py-1.5 font-semibold';
    dotSize = 'w-2 h-2';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-md border border-opacity-30 ${info.badgeBg} ${sizeStyles} ${className}`}
      title={info.description}
    >
      <span
        className={`rounded-full ${dotSize} shrink-0 animate-pulse`}
        style={{ backgroundColor: info.hex }}
      />
      <span>Level {level}</span>
      {showDetails && (
        <span className="text-[10px] opacity-80 border-l border-current pl-1.5 ml-0.5 uppercase tracking-wider">
          {level === 'A' ? 'Dual-Auth' : level === 'B' ? 'Restricted' : 'Standard'}
        </span>
      )}
    </span>
  );
};
