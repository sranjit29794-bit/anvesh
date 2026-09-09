import { SensitivityLevel } from './document.types';

export interface CaseRecord {
  case_id: string;
  case_number: string; // e.g. "FIR-2024-ND-0842"
  title: string;
  department: string;
  investigating_officer: string;
  status: 'UNDER_INVESTIGATION' | 'CHARGE_SHEETED' | 'IN_TRIAL' | 'CLOSED';
  created_at: string;
  updated_at: string;
  document_counts: {
    total: number;
    sensitivity_a: number;
    sensitivity_b: number;
    sensitivity_c: number;
    by_type: Record<string, number>;
  };
  assigned_members: Array<{
    user_id: string;
    username: string;
    role: string;
    assigned_at: string;
  }>;
}

export interface CaseSummaryResponse {
  case_id: string;
  case_number: string;
  executive_summary: string;
  key_findings: string[];
  timeline_highlights: Array<{
    date: string;
    event: string;
    doc_id: string;
    sensitivity_level: SensitivityLevel;
  }>;
  cited_doc_ids: string[];
  requires_human_verification: true;
  generated_at: string;
}
