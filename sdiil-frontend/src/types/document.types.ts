export type SensitivityLevel = 'A' | 'B' | 'C';

export type DocType =
  | 'FIR'
  | 'WITNESS_STATEMENT'
  | 'CHARGE_SHEET'
  | 'FORENSIC_REPORT'
  | 'COURT_FILING'
  | 'INVESTIGATION_REPORT'
  | 'LEGAL_NOTICE'
  | 'OTHER';

export type DocumentStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED';

export type DocumentMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/tiff'
  | 'text/plain'
  | 'application/octet-stream'
  | string;

export interface DocumentFlags {
  ocr_low_confidence?: boolean;
  classification_needs_review?: boolean;
  citation_hallucinated?: boolean;
  tamper_detected?: boolean;
}

export interface DocumentMetadata {
  case_id_reference?: string;
  document_date?: string;
  issuing_department?: string;
  author_name?: string;
  mentioned_entities?: string[];
  ai_extracted?: boolean;
  file_size_bytes?: number;
  mime_type?: string;
}

export interface DocumentVersion {
  version_id: string;
  file_id: string;
  version_number: number;
  hash: string;
  minio_path: string;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  change_summary?: string;
}

export interface DocumentRecord {
  file_id: string;
  case_id: string;
  uploader_id: string;
  uploader_name?: string;
  title: string;
  doc_type: DocType;
  sensitivity_level: SensitivityLevel;
  mime_type?: DocumentMimeType;
  original_hash: string;
  computed_hash?: string;
  system_signature: string;
  minio_path: string;
  ocr_text?: string;
  metadata: DocumentMetadata;
  classification_confidence: number;
  flags: DocumentFlags;
  version: number;
  status: DocumentStatus;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_at: string;
  is_synthetic: boolean;
  access_expiry?: string; // If access is time-limited
}

export interface DocumentUploadResponse {
  file_id: string;
  doc_type: DocType;
  sensitivity_level: SensitivityLevel;
  classification_confidence: number;
  original_hash: string;
  version: number;
  status: string;
  flags: DocumentFlags;
  minio_path: string;
  requires_human_verification: true;
}

export interface TamperVerificationResult {
  doc_id: string;
  case_id: string;
  case_number?: string;
  doc_title?: string;
  doc_type?: string;
  version_number?: number;
  checked_by?: string;
  status?: 'VERIFIED' | 'TAMPERED';
  is_valid?: boolean;
  verification_status: 'VERIFIED' | 'TAMPERED';
  original_hash: string;
  computed_hash: string;
  registered_hash?: string;
  hashes_match: boolean;
  storage_integrity_failure: boolean;
  system_signature: string;
  blockchain_events_count: number;
  audit_events_count: number;
  sharing_events_count: number;
  report_url?: string;
  generated_at: string;
  checked_at: string;
  requires_human_verification: true;
}

export interface BlockchainEvent {
  event_id: string;
  event_type: 'UPLOAD' | 'VERSION_CREATED' | 'DOCUMENT_SHARED' | 'VERIFICATION_REQUESTED';
  doc_id: string;
  case_id: string;
  hash: string;
  version: number;
  actor_id: string;
  actor_name?: string;
  timestamp: string;
}

export interface AuditLogEntry {
  log_id: string;
  user_id: string;
  username: string;
  user_role?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  description?: string;
  doc_id?: string;
  case_id?: string;
  case_number?: string;
  timestamp: string;
  ip_address: string;
  metadata?: Record<string, unknown>;
}

export interface SharingApproval {
  approval_id: string;
  doc_id: string;
  doc_title?: string;
  doc_type?: DocType;
  case_id: string;
  initiator_id: string;
  initiator_name: string;
  initiator_role: string;
  recipient_user_id?: string;
  recipient_name?: string;
  recipient_role: string;
  share_reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
  resolved_by_name?: string;
  sensitivity_level: SensitivityLevel;
}

export interface ConsentReceipt {
  event_id: string;
  receipt_hash: string;
  receipt_signature: string;
  doc_id: string;
  doc_title?: string;
  case_id: string;
  initiator_id: string;
  initiator_name: string;
  recipient_id?: string;
  recipient_name?: string;
  recipient_role: string;
  approver_name?: string;
  share_reason: string;
  valid_until: string;
  timestamp: string;
  minio_path?: string;
  pdf_url?: string;
}

export interface RAGSearchCitation {
  chunk_id: string;
  doc_id: string;
  doc_title: string;
  doc_type: DocType;
  sensitivity_level: SensitivityLevel;
  chunk_text: string;
  similarity_score: number;
}

export interface RAGSearchResponse {
  answer: string;
  cited_doc_ids: string[];
  citations: RAGSearchCitation[];
  chunks_used_count: number;
  requires_human_verification: true;
  query_id: string;
  flags: DocumentFlags;
  query_timestamp: string;
}

export interface AnomalyAlert {
  alert_id: string;
  alert_type: 'BULK_DOWNLOAD' | 'OFF_HOURS_ACCESS' | 'CROSS_CASE_PROBING';
  severity: 'HIGH' | 'MEDIUM' | 'CRITICAL';
  user_id: string;
  username: string;
  description: string;
  timestamp: string;
  case_id?: string;
  ip_address: string;
  status: 'NEW' | 'INVESTIGATING' | 'DISMISSED';
}
