import { SensitivityLevel } from '@/types/document.types';

export const SENSITIVITY_COLORS: Record<
  SensitivityLevel,
  {
    hex: string;
    bg: string;
    border: string;
    text: string;
    badgeBg: string;
    label: string;
    description: string;
  }
> = {
  A: {
    hex: '#E84545',
    bg: 'bg-[#E84545]/10',
    border: 'border-[#E84545]',
    text: 'text-[#E84545]',
    badgeBg: 'bg-[#E84545]/15 text-[#E84545] border-[#E84545]/30',
    label: 'Sensitivity A',
    description: 'Highest — Dual-Authorization Required for Access & Share',
  },
  B: {
    hex: '#F5A623',
    bg: 'bg-[#F5A623]/10',
    border: 'border-[#F5A623]',
    text: 'text-[#F5A623]',
    badgeBg: 'bg-[#F5A623]/15 text-[#F5A623] border-[#F5A623]/30',
    label: 'Sensitivity B',
    description: 'Medium — Department Officers & Reviewers',
  },
  C: {
    hex: '#22C97A',
    bg: 'bg-[#22C97A]/10',
    border: 'border-[#22C97A]',
    text: 'text-[#22C97A]',
    badgeBg: 'bg-[#22C97A]/15 text-[#22C97A] border-[#22C97A]/30',
    label: 'Sensitivity C',
    description: 'Low — Broad Court & Inter-Pillar Clearance',
  },
};

/**
 * Returns color tokens and metadata for a given sensitivity level
 */
export function getSensitivityInfo(level: SensitivityLevel) {
  return SENSITIVITY_COLORS[level] || SENSITIVITY_COLORS.C;
}
