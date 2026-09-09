import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

export interface TamperBadgeProps {
  status: 'VERIFIED' | 'TAMPERED';
  hashesMatch?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const TamperBadge: React.FC<TamperBadgeProps> = ({
  status,
  hashesMatch = true,
  className = '',
  size = 'md',
}) => {
  const isTampered = status === 'TAMPERED' || !hashesMatch;

  let sizeStyles = 'px-2.5 py-1 text-xs gap-1.5';
  let iconSize = 'w-3.5 h-3.5';

  if (size === 'sm') {
    sizeStyles = 'px-2 py-0.5 text-[11px] gap-1';
    iconSize = 'w-3 h-3';
  } else if (size === 'lg') {
    sizeStyles = 'px-4 py-2 text-sm gap-2 font-bold';
    iconSize = 'w-5 h-5';
  }

  if (isTampered) {
    return (
      <span
        className={`inline-flex items-center rounded-btn font-mono uppercase tracking-wider bg-accent-danger text-white border-2 border-[#FFAAAA] shadow-[0_0_12px_rgba(232,69,69,0.5)] animate-pulse ${sizeStyles} ${className}`}
        title="CRITICAL INTEGRITY FAILURE: Raw bytes do not match registered SHA-256 hash or storage GCM tag."
      >
        <ShieldAlert className={`${iconSize} shrink-0 animate-bounce`} />
        <span>TAMPER DETECTED</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-btn font-mono uppercase tracking-wider bg-accent-success/15 text-accent-success border border-accent-success/40 ${sizeStyles} ${className}`}
      title="Cryptographic integrity confirmed: Recomputed SHA-256 matches blockchain immutable anchor."
    >
      <ShieldCheck className={`${iconSize} shrink-0`} />
      <span>VERIFIED (SHA-256 MATCH)</span>
    </span>
  );
};
