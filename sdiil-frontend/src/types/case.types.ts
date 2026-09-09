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

export interface CaseSummarySection {
  title: string;
  content: string;
  cited_doc_ids: string[];
}

export interface StructuredCaseSummary {
  case_overview: CaseSummarySection;
  key_incidents: CaseSummarySection;
  persons_of_interest: CaseSummarySection;
  evidence_summary: CaseSummarySection;
  investigation_status: CaseSummarySection;
}

export interface CaseSummaryResponse {
  case_id?: string;
  case_number?: string;
  summary: StructuredCaseSummary;
  cited_doc_ids: string[];
  citations?: Array<{
    chunk_id: string;
    doc_id: string;
    doc_title: string;
    doc_type: string;
    sensitivity_level: SensitivityLevel;
    case_id: string;
    chunk_text: string;
    similarity_score: number;
  }>;
  chunks_used: number;
  requires_human_verification: true;
  generated_at: string;
  // Optional backward compatibility fields
  executive_summary?: string;
  key_findings?: string[];
  timeline_highlights?: Array<{
    date: string;
    event: string;
    doc_id: string;
    sensitivity_level: SensitivityLevel;
  }>;
}
