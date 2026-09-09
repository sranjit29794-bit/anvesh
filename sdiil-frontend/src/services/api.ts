/**
 * Base mock API client and in-memory synthetic data store for SDIIL DMS prototype.
 * Conforms strictly to ICJS DMS rules and workflows.
 * All demo documents and records are marked [SYNTHETIC / SAMPLE].
 */

import { User } from '@/types/auth.types';
import {
  DocumentRecord,
  DocumentVersion,
  BlockchainEvent,
  AuditLogEntry,
  SharingApproval,
  ConsentReceipt,
  AnomalyAlert,
} from '@/types/document.types';
import { CaseRecord } from '@/types/case.types';

// Default mock users covering all 7 required roles
export const INITIAL_USERS: User[] = [
  {
    user_id: 'usr-001',
    username: 'rajesh.sharma',
    full_name: 'Inspector Rajesh Sharma',
    role: 'INVESTIGATOR',
    department: 'Crime Branch, Special Cell',
    badge_number: 'CB-4912',
    email: 'r.sharma@delhipolice.nic.in',
    account_status: 'ACTIVE',
    mfa_method: 'TOTP',
    case_ids: ['case-del-2024-001', 'case-del-2024-002'],
    sensitivity_clearance: 'A',
    failed_attempts: 0,
    last_login: '2026-09-08T08:30:00Z',
    created_at: '2024-01-10T10:00:00Z',
  },
  {
    user_id: 'usr-002',
    username: 'anita.deshmukh',
    full_name: 'ACP Anita Deshmukh',
    role: 'SUPERVISOR',
    department: 'Zonal Supervision, Crime Division',
    badge_number: 'ACP-1044',
    email: 'a.deshmukh@delhipolice.nic.in',
    account_status: 'ACTIVE',
    mfa_method: 'TOTP',
    case_ids: ['case-del-2024-001', 'case-del-2024-002', 'case-del-2024-003'],
    sensitivity_clearance: 'A',
    failed_attempts: 0,
    last_login: '2026-09-08T09:15:00Z',
    created_at: '2023-11-05T09:00:00Z',
  },
  {
    user_id: 'usr-003',
    username: 'sysadmin.icjs',
    full_name: 'Vikramaditya Rao',
    role: 'ADMIN',
    department: 'NIC / ICJS Central Infrastructure',
    badge_number: 'ADM-0091',
    email: 'admin.dms@icjs.gov.in',
    account_status: 'ACTIVE',
    mfa_method: 'TOTP',
    case_ids: ['case-del-2024-001', 'case-del-2024-002', 'case-del-2024-003'],
    sensitivity_clearance: 'A',
    failed_attempts: 0,
    last_login: '2026-09-08T07:45:00Z',
    created_at: '2023-08-01T06:00:00Z',
  },
  {
    user_id: 'usr-004',
    username: 'kavita.advocate',
    full_name: 'Adv. Kavita Sen',
    role: 'PROSECUTOR',
    department: 'Directorate of Prosecution, Delhi',
    badge_number: 'DP-8120',
    email: 'k.sen@prosecution.delhi.gov.in',
    account_status: 'ACTIVE',
    mfa_method: 'TOTP',
    case_ids: ['case-del-2024-001'],
    sensitivity_clearance: 'B',
    failed_attempts: 0,
    last_login: '2026-09-07T16:20:00Z',
    created_at: '2024-02-14T11:00:00Z',
  },
  {
    user_id: 'usr-005',
    username: 'dr.subhash.fsl',
    full_name: 'Dr. Subhash Bose',
    role: 'FORENSIC_OFFICER',
    department: 'Forensic Science Laboratory, Cyber & Ballistics',
    badge_number: 'FSL-229',
    email: 's.bose@fsl.delhi.gov.in',
    account_status: 'ACTIVE',
    mfa_method: 'TOTP',
    case_ids: ['case-del-2024-001', 'case-del-2024-002'],
    sensitivity_clearance: 'B',
    failed_attempts: 0,
    last_login: '2026-09-08T09:00:00Z',
    created_at: '2024-01-20T08:30:00Z',
  },
  {
    user_id: 'usr-006',
    username: 'meenakshi.registrar',
    full_name: 'Meenakshi Iyer',
    role: 'COURT_REGISTRAR',
    department: 'Principal District & Sessions Court, Delhi',
    badge_number: 'CR-5541',
    email: 'registrar.nd@delhicourts.nic.in',
    account_status: 'ACTIVE',
    mfa_method: 'TOTP',
    case_ids: ['case-del-2024-001'],
    sensitivity_clearance: 'C',
    failed_attempts: 0,
    last_login: '2026-09-08T10:05:00Z',
    created_at: '2024-03-01T09:15:00Z',
  },
  {
    user_id: 'usr-007',
    username: 'arun.auditor',
    full_name: 'Arun Kumar',
    role: 'REVIEWER',
    department: 'Judicial Oversight & Audit Directorate',
    badge_number: 'REV-901',
    email: 'a.kumar@oversight.gov.in',
    account_status: 'ACTIVE',
    mfa_method: 'TOTP',
    case_ids: ['case-del-2024-001', 'case-del-2024-002'],
    sensitivity_clearance: 'B',
    failed_attempts: 0,
    last_login: '2026-09-07T14:10:00Z',
    created_at: '2024-02-01T08:00:00Z',
  },
];

// Initial synthetic cases
export const INITIAL_CASES: CaseRecord[] = [
  {
    case_id: 'case-del-2024-001',
    case_number: 'FIR-2024-ND-0842',
    title: '[SYNTHETIC] State vs. Syndicate Ops (Cyber Financial Fraud)',
    department: 'Cyber Crime Police Station, Special Cell',
    investigating_officer: 'Inspector Rajesh Sharma',
    status: 'UNDER_INVESTIGATION',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2026-09-08T08:30:00Z',
    document_counts: {
      total: 5,
      sensitivity_a: 2,
      sensitivity_b: 2,
      sensitivity_c: 1,
      by_type: {
        FIR: 1,
        WITNESS_STATEMENT: 2,
        FORENSIC_REPORT: 1,
        COURT_FILING: 1,
      },
    },
    assigned_members: [
      { user_id: 'usr-001', username: 'rajesh.sharma', role: 'INVESTIGATOR', assigned_at: '2024-03-15T09:00:00Z' },
      { user_id: 'usr-002', username: 'anita.deshmukh', role: 'SUPERVISOR', assigned_at: '2024-03-15T09:00:00Z' },
      { user_id: 'usr-004', username: 'kavita.advocate', role: 'PROSECUTOR', assigned_at: '2024-03-16T11:00:00Z' },
      { user_id: 'usr-005', username: 'dr.subhash.fsl', role: 'FORENSIC_OFFICER', assigned_at: '2024-03-17T14:00:00Z' },
      { user_id: 'usr-006', username: 'meenakshi.registrar', role: 'COURT_REGISTRAR', assigned_at: '2024-03-20T10:00:00Z' },
      { user_id: 'usr-007', username: 'arun.auditor', role: 'REVIEWER', assigned_at: '2024-03-22T08:00:00Z' },
    ],
  },
  {
    case_id: 'case-del-2024-002',
    case_number: 'FIR-2024-SW-0319',
    title: '[SYNTHETIC] State vs. Ramesh Verma (Counterfeit Stamp Paper)',
    department: 'Economic Offences Wing (EOW)',
    investigating_officer: 'Inspector Rajesh Sharma',
    status: 'CHARGE_SHEETED',
    created_at: '2024-04-10T10:30:00Z',
    updated_at: '2026-09-05T11:00:00Z',
    document_counts: {
      total: 3,
      sensitivity_a: 1,
      sensitivity_b: 1,
      sensitivity_c: 1,
      by_type: {
        FIR: 1,
        CHARGE_SHEET: 1,
        WITNESS_STATEMENT: 1,
      },
    },
    assigned_members: [
      { user_id: 'usr-001', username: 'rajesh.sharma', role: 'INVESTIGATOR', assigned_at: '2024-04-10T10:30:00Z' },
      { user_id: 'usr-002', username: 'anita.deshmukh', role: 'SUPERVISOR', assigned_at: '2024-04-10T10:30:00Z' },
      { user_id: 'usr-005', username: 'dr.subhash.fsl', role: 'FORENSIC_OFFICER', assigned_at: '2024-04-12T15:00:00Z' },
      { user_id: 'usr-007', username: 'arun.auditor', role: 'REVIEWER', assigned_at: '2024-04-15T09:00:00Z' },
    ],
  },
  {
    case_id: 'case-del-2024-003',
    case_number: 'FIR-2024-ND-1102',
    title: '[SYNTHETIC] Cross-Border Illicit Hawala Transactions Network',
    department: 'Special Operations Group (SOG)',
    investigating_officer: 'ACP Anita Deshmukh',
    status: 'IN_TRIAL',
    created_at: '2024-05-02T14:15:00Z',
    updated_at: '2026-09-02T16:45:00Z',
    document_counts: {
      total: 2,
      sensitivity_a: 1,
      sensitivity_b: 1,
      sensitivity_c: 0,
      by_type: {
        CHARGE_SHEET: 1,
        WITNESS_STATEMENT: 1,
      },
    },
    assigned_members: [
      { user_id: 'usr-002', username: 'anita.deshmukh', role: 'SUPERVISOR', assigned_at: '2024-05-02T14:15:00Z' },
      { user_id: 'usr-003', username: 'sysadmin.icjs', role: 'ADMIN', assigned_at: '2024-05-02T14:15:00Z' },
    ],
  },
];

// Initial synthetic documents with authentic SHA-256 hashes and digital signatures
export const INITIAL_DOCUMENTS: DocumentRecord[] = [
  {
    file_id: 'doc-del-001',
    case_id: 'case-del-2024-001',
    uploader_id: 'usr-001',
    uploader_name: 'Inspector Rajesh Sharma',
    title: '[SYNTHETIC] Protected Key Witness Deposition — Mr. X',
    doc_type: 'WITNESS_STATEMENT',
    sensitivity_level: 'A',
    original_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    computed_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    system_signature: 'RSA2048-SIG-7F3A902C1E44BB1094AA7731DE490C8B12',
    minio_path: '/evidence-vault/case-del-2024-001/doc-del-001/v1/encrypted',
    ocr_text:
      '[SAMPLE SYNTHETIC DEPOSITION]\nDate: 18 March 2024. Deposition recorded under Sec 164 CrPC.\nWitness identity protected under Witness Protection Scheme Category A.\nDeponent states that illegal offshore wire transfers originating from account 9948-XXXX-0012 were coordinated through encrypted messaging channels using handle "ShadowNode". Funds totaling INR 4.2 Crores were layered through multiple shell entities.',
    metadata: {
      case_id_reference: 'FIR-2024-ND-0842',
      document_date: '18/03/2024',
      issuing_department: 'Metropolitan Magistrate Court, Patiala House',
      author_name: 'Sh. Amit Verma, CMM',
      mentioned_entities: ['ShadowNode', 'Account 9948-XXXX', 'Axis Shell Ledger'],
      ai_extracted: true,
      file_size_bytes: 348200,
      mime_type: 'application/pdf',
    },
    classification_confidence: 0.98,
    flags: {
      ocr_low_confidence: false,
      classification_needs_review: false,
    },
    version: 1,
    status: 'ACTIVE',
    created_at: '2024-03-18T11:45:00Z',
    is_synthetic: true,
  },
  {
    file_id: 'doc-del-002',
    case_id: 'case-del-2024-001',
    uploader_id: 'usr-005',
    uploader_name: 'Dr. Subhash Bose',
    title: '[SYNTHETIC] Hard Drive Bitstream Forensic Extraction Report',
    doc_type: 'FORENSIC_REPORT',
    sensitivity_level: 'B',
    original_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    computed_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    system_signature: 'RSA2048-SIG-9B1130CE2F01DD9478AA552109CC3E4F',
    minio_path: '/evidence-vault/case-del-2024-001/doc-del-002/v1/encrypted',
    ocr_text:
      '[SAMPLE FORENSIC REPORT - FSL DEL]\nItem: Seagate 2TB Internal HDD (S/N: WDC-884910-K).\nHash Verification: MD5 and SHA-256 matches bitstream image exactly.\nArtifact findings: Deleted directory containing 42 excel ledgers recovered. Metadata confirms modification on 12-03-2024 23:14:02 IST.',
    metadata: {
      case_id_reference: 'FIR-2024-ND-0842 / FSL-CY-2024-098',
      document_date: '22/03/2024',
      issuing_department: 'Forensic Science Laboratory, Delhi',
      author_name: 'Dr. Subhash Bose, Sr. Scientific Officer',
      mentioned_entities: ['Seagate 2TB', 'FSL Rohini', 'MD5 Match'],
      ai_extracted: true,
      file_size_bytes: 1420900,
      mime_type: 'application/pdf',
    },
    classification_confidence: 0.99,
    flags: {
      ocr_low_confidence: false,
      classification_needs_review: false,
    },
    version: 1,
    status: 'ACTIVE',
    created_at: '2024-03-22T14:30:00Z',
    is_synthetic: true,
  },
  {
    file_id: 'doc-del-003',
    case_id: 'case-del-2024-001',
    uploader_id: 'usr-001',
    uploader_name: 'Inspector Rajesh Sharma',
    title: '[SYNTHETIC] First Information Report (FIR No. 0842/2024)',
    doc_type: 'FIR',
    sensitivity_level: 'B',
    original_hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    computed_hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    system_signature: 'RSA2048-SIG-442A001EF889BCA901456DEF0021A77E',
    minio_path: '/evidence-vault/case-del-2024-001/doc-del-003/v1/encrypted',
    ocr_text:
      '[SAMPLE FIR EXTRACT]\nPolice Station: Cyber Crime Special Cell.\nSections: 420, 120B IPC r/w Sec 66C & 66D Information Technology Act 2000.\nComplainant: Lead Compliance Officer, Nationalized Banking Corp.\nBrief: Systemic unauthorized API queries resulting in diverted settlement tranches.',
    metadata: {
      case_id_reference: 'FIR-2024-ND-0842',
      document_date: '15/03/2024',
      issuing_department: 'Cyber Crime Police Station',
      author_name: 'Inspector Rajesh Sharma',
      mentioned_entities: ['IPC 420', 'Sec 66D IT Act', 'Special Cell'],
      ai_extracted: true,
      file_size_bytes: 412000,
      mime_type: 'application/pdf',
    },
    classification_confidence: 0.99,
    flags: {},
    version: 1,
    status: 'ACTIVE',
    created_at: '2024-03-15T09:30:00Z',
    is_synthetic: true,
  },
  {
    file_id: 'doc-del-004',
    case_id: 'case-del-2024-001',
    uploader_id: 'usr-001',
    uploader_name: 'Inspector Rajesh Sharma',
    title: '[SYNTHETIC] Notice to Intermediary Under Sec 91 CrPC',
    doc_type: 'LEGAL_NOTICE',
    sensitivity_level: 'C',
    original_hash: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    computed_hash: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    system_signature: 'RSA2048-SIG-119933EFAABBCCDD12345678',
    minio_path: '/evidence-vault/case-del-2024-001/doc-del-004/v1/encrypted',
    ocr_text:
      '[SAMPLE STATUTORY NOTICE]\nNotice under Section 91 of Code of Criminal Procedure 1973.\nTo: Nodal Officer, Telecom Service Provider.\nRequisition: Call Data Records (CDR) and Subscriber Information for MSISDN +91-9876543210 for period 01-01-2024 to 15-03-2024.',
    metadata: {
      case_id_reference: 'FIR-2024-ND-0842',
      document_date: '16/03/2024',
      issuing_department: 'Special Cell Delhi Police',
      author_name: 'Inspector Rajesh Sharma',
      mentioned_entities: ['Sec 91 CrPC', 'Nodal Officer', 'CDR Requisition'],
      ai_extracted: true,
      file_size_bytes: 184500,
      mime_type: 'application/pdf',
    },
    classification_confidence: 0.94,
    flags: {},
    version: 1,
    status: 'ACTIVE',
    created_at: '2024-03-16T12:00:00Z',
    is_synthetic: true,
  },
  {
    file_id: 'doc-del-005',
    case_id: 'case-del-2024-001',
    uploader_id: 'usr-001',
    uploader_name: 'Inspector Rajesh Sharma',
    title: '[SYNTHETIC] Informant Intelligence Log & Field Operative Debrief',
    doc_type: 'WITNESS_STATEMENT',
    sensitivity_level: 'A',
    original_hash: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    computed_hash: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    system_signature: 'RSA2048-SIG-8877665544332211AABBCCDDEEFF',
    minio_path: '/evidence-vault/case-del-2024-001/doc-del-005/v1/encrypted',
    ocr_text:
      '[SAMPLE CLASSIFIED OPERATIVE DEBRIEF]\nSensitivity: HIGH / RESTRICTED.\nSubject: Source codename "Falcon" reported covert safehouse operations in Sector 18, Gurugram. Cash handling logistics operated bi-weekly using rented courier vans.',
    metadata: {
      case_id_reference: 'FIR-2024-ND-0842',
      document_date: '24/03/2024',
      issuing_department: 'Anti-Terror & Syndicate Desk',
      author_name: 'Inspector Rajesh Sharma',
      mentioned_entities: ['Source Falcon', 'Sector 18 Hub', 'Logistics Grid'],
      ai_extracted: true,
      file_size_bytes: 290100,
      mime_type: 'application/pdf',
    },
    classification_confidence: 0.97,
    flags: {},
    version: 1,
    status: 'ACTIVE',
    created_at: '2024-03-24T16:00:00Z',
    is_synthetic: true,
  },
];

// Initial synthetic document versions
export const INITIAL_VERSIONS: DocumentVersion[] = [
  {
    version_id: 'ver-001-1',
    file_id: 'doc-del-001',
    version_number: 1,
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    minio_path: '/evidence-vault/case-del-2024-001/doc-del-001/v1/encrypted',
    created_by: 'usr-001',
    created_by_name: 'Inspector Rajesh Sharma',
    created_at: '2024-03-18T11:45:00Z',
    change_summary: 'Initial Ingestion and Envelope Encryption',
  },
  {
    version_id: 'ver-002-1',
    file_id: 'doc-del-002',
    version_number: 1,
    hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    minio_path: '/evidence-vault/case-del-2024-001/doc-del-002/v1/encrypted',
    created_by: 'usr-005',
    created_by_name: 'Dr. Subhash Bose',
    created_at: '2024-03-22T14:30:00Z',
    change_summary: 'FSL Lab Report Registration',
  },
];

// Initial synthetic audit log entries (strictly read-only by design)
export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    log_id: 'aud-001',
    user_id: 'usr-001',
    username: 'rajesh.sharma',
    action: 'LOGIN_SUCCESS',
    timestamp: '2026-09-08T08:30:00Z',
    ip_address: '10.14.22.8',
    metadata: { mfa_method: 'TOTP', session_valid_hours: 8 },
  },
  {
    log_id: 'aud-002',
    user_id: 'usr-001',
    username: 'rajesh.sharma',
    action: 'DOCUMENT_UPLOADED',
    doc_id: 'doc-del-001',
    case_id: 'case-del-2024-001',
    timestamp: '2024-03-18T11:45:00Z',
    ip_address: '10.14.22.8',
    metadata: {
      doc_type: 'WITNESS_STATEMENT',
      sensitivity_level: 'A',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
  },
  {
    log_id: 'aud-003',
    user_id: 'usr-002',
    username: 'anita.deshmukh',
    action: 'DOCUMENT_VIEWED',
    doc_id: 'doc-del-001',
    case_id: 'case-del-2024-001',
    timestamp: '2024-03-19T09:12:00Z',
    ip_address: '10.14.20.14',
    metadata: { clearance_verified: 'A' },
  },
  {
    log_id: 'aud-004',
    user_id: 'usr-005',
    username: 'dr.subhash.fsl',
    action: 'DOCUMENT_UPLOADED',
    doc_id: 'doc-del-002',
    case_id: 'case-del-2024-001',
    timestamp: '2024-03-22T14:30:00Z',
    ip_address: '10.14.99.3',
    metadata: { doc_type: 'FORENSIC_REPORT', sensitivity_level: 'B' },
  },
  {
    log_id: 'aud-005',
    user_id: 'usr-001',
    username: 'rajesh.sharma',
    action: 'SEARCH_QUERY',
    case_id: 'case-del-2024-001',
    timestamp: '2026-09-08T09:00:00Z',
    ip_address: '10.14.22.8',
    metadata: { query_length: 32, chunks_returned: 4, cited_docs: ['doc-del-001', 'doc-del-002'] },
  },
];

// Initial synthetic blockchain events
export const INITIAL_BLOCKCHAIN_EVENTS: BlockchainEvent[] = [
  {
    event_id: 'blk-001',
    event_type: 'UPLOAD',
    doc_id: 'doc-del-001',
    case_id: 'case-del-2024-001',
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    version: 1,
    actor_id: 'usr-001',
    actor_name: 'Inspector Rajesh Sharma',
    timestamp: '2024-03-18T11:45:02Z',
  },
  {
    event_id: 'blk-002',
    event_type: 'UPLOAD',
    doc_id: 'doc-del-002',
    case_id: 'case-del-2024-001',
    hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    version: 1,
    actor_id: 'usr-005',
    actor_name: 'Dr. Subhash Bose',
    timestamp: '2024-03-22T14:30:03Z',
  },
];

// Initial synthetic approvals
export const INITIAL_APPROVALS: SharingApproval[] = [
  {
    approval_id: 'appr-001',
    doc_id: 'doc-del-001',
    doc_title: '[SYNTHETIC] Protected Key Witness Deposition — Mr. X',
    doc_type: 'WITNESS_STATEMENT',
    case_id: 'case-del-2024-001',
    initiator_id: 'usr-001',
    initiator_name: 'Inspector Rajesh Sharma',
    initiator_role: 'INVESTIGATOR',
    recipient_user_id: 'usr-004',
    recipient_name: 'Adv. Kavita Sen',
    recipient_role: 'PROSECUTOR',
    share_reason: 'Drafting of formal charges and court trial preparation (Special Court 3)',
    status: 'PENDING',
    created_at: '2026-09-08T08:45:00Z',
    sensitivity_level: 'A',
  },
];

// Initial synthetic consent receipts
export const INITIAL_RECEIPTS: ConsentReceipt[] = [
  {
    event_id: 'rcpt-001',
    receipt_hash: '7b919a3b2e558c9735d4f260718d7bc89d81d2df6f78f56fca1207e999933a01',
    receipt_signature: 'RSA-SIG-RECEIPT-AA9012DEFFBC112',
    doc_id: 'doc-del-003',
    doc_title: '[SYNTHETIC] First Information Report (FIR No. 0842/2024)',
    case_id: 'case-del-2024-001',
    initiator_id: 'usr-001',
    initiator_name: 'Inspector Rajesh Sharma',
    recipient_id: 'usr-004',
    recipient_name: 'Adv. Kavita Sen',
    recipient_role: 'PROSECUTOR',
    share_reason: 'Statutory transmission of FIR copy to Public Prosecutor',
    valid_until: '2026-09-15T09:30:00Z',
    timestamp: '2024-03-16T10:00:00Z',
    minio_path: '/evidence-vault/case-del-2024-001/doc-del-003/receipts/rcpt-001.pdf',
  },
];

// Initial anomaly alerts for the Dashboard widget
export const INITIAL_ANOMALIES: AnomalyAlert[] = [
  {
    alert_id: 'anom-001',
    alert_type: 'OFF_HOURS_ACCESS',
    severity: 'MEDIUM',
    user_id: 'usr-004',
    username: 'kavita.advocate',
    description: 'Document access initiated at 03:14 AM IST outside standard judicial operating hours.',
    timestamp: '2026-09-07T21:44:00Z',
    case_id: 'case-del-2024-001',
    ip_address: '192.168.10.45',
    status: 'NEW',
  },
  {
    alert_id: 'anom-002',
    alert_type: 'BULK_DOWNLOAD',
    severity: 'HIGH',
    user_id: 'usr-007',
    username: 'arun.auditor',
    description: '14 documents downloaded within a 120-second burst window.',
    timestamp: '2026-09-06T15:20:00Z',
    case_id: 'case-del-2024-002',
    ip_address: '10.14.90.11',
    status: 'INVESTIGATING',
  },
  {
    alert_id: 'anom-003',
    alert_type: 'CROSS_CASE_PROBING',
    severity: 'CRITICAL',
    user_id: 'unknown-probe',
    username: 'unassigned-session',
    description: 'Repeated 403 authorization failures on Case FIR-2024-ND-1102 from unassigned IP.',
    timestamp: '2026-09-08T06:12:00Z',
    case_id: 'case-del-2024-003',
    ip_address: '185.220.101.5',
    status: 'NEW',
  },
];

// Client-side state holder (persisting in memory during user session)
class MockDatabase {
  users: User[] = [...INITIAL_USERS];
  cases: CaseRecord[] = [...INITIAL_CASES];
  documents: DocumentRecord[] = [...INITIAL_DOCUMENTS];
  versions: DocumentVersion[] = [...INITIAL_VERSIONS];
  auditLogs: AuditLogEntry[] = [...INITIAL_AUDIT_LOGS];
  blockchainEvents: BlockchainEvent[] = [...INITIAL_BLOCKCHAIN_EVENTS];
  approvals: SharingApproval[] = [...INITIAL_APPROVALS];
  receipts: ConsentReceipt[] = [...INITIAL_RECEIPTS];
  anomalies: AnomalyAlert[] = [...INITIAL_ANOMALIES];

  // Helper to log audit event immutably
  logAudit(entry: Omit<AuditLogEntry, 'log_id' | 'timestamp'>) {
    const newLog: AuditLogEntry = {
      log_id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    // Prepend for newest-first display
    this.auditLogs = [newLog, ...this.auditLogs];
    return newLog;
  }
}

export const db = new MockDatabase();

// Simulated network latency helper
export function delay(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
