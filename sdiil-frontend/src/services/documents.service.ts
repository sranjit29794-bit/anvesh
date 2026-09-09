import { db, delay } from './api';
import {
  DocumentRecord,
  DocumentVersion,
  DocumentUploadResponse,
  DocType,
  SensitivityLevel,
  AnomalyAlert,
} from '@/types/document.types';

// Helper to simulate SHA-256 hash calculation from file content or metadata
function generateMockSha256(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex}${hex.split('').reverse().join('')}9f86d081884c7d659a2feaa0c55ad015`.slice(0, 64);
}

export const documentsService = {
  /**
   * List documents belonging to a case (ABAC filtering done at caller/hook layer)
   */
  async getDocumentsByCase(caseId: string): Promise<DocumentRecord[]> {
    await delay(150);
    return db.documents.filter((d) => d.case_id === caseId);
  },

  /**
   * Retrieve a single document record by ID
   */
  async getDocument(docId: string, userId?: string, username?: string): Promise<DocumentRecord> {
    await delay(150);
    const doc = db.documents.find((d) => d.file_id === docId);
    if (!doc) throw new Error('Document not found in vault');

    if (userId && username) {
      db.logAudit({
        user_id: userId,
        username,
        action: 'DOCUMENT_VIEWED',
        doc_id: doc.file_id,
        case_id: doc.case_id,
        ip_address: '10.14.22.8',
        metadata: {
          doc_type: doc.doc_type,
          sensitivity_level: doc.sensitivity_level,
          version: doc.version,
        },
      });
    }

    return { ...doc };
  },

  /**
   * Retrieve document version history
   */
  async getDocumentVersions(docId: string): Promise<DocumentVersion[]> {
    await delay(120);
    return db.versions.filter((v) => v.file_id === docId);
  },

  /**
   * Ingest a new document according to workflow-document-ingest
   */
  async uploadDocument(
    caseId: string,
    file: File,
    uploaderId: string,
    uploaderName: string,
    manualDocType?: DocType
  ): Promise<DocumentUploadResponse> {
    await delay(500);

    // Audit attempt
    db.logAudit({
      user_id: uploaderId,
      username: uploaderName,
      action: 'UPLOAD_ATTEMPT',
      case_id: caseId,
      ip_address: '10.14.22.8',
      metadata: { filename: file.name, size: file.size },
    });

    const fileId = `doc-del-${Date.now().toString().slice(-4)}`;

    // AI Classification simulation
    let detectedType: DocType = manualDocType || 'INVESTIGATION_REPORT';
    const lowerName = file.name.toLowerCase();
    if (lowerName.includes('fir')) detectedType = 'FIR';
    else if (lowerName.includes('witness') || lowerName.includes('statement')) detectedType = 'WITNESS_STATEMENT';
    else if (lowerName.includes('forensic') || lowerName.includes('lab')) detectedType = 'FORENSIC_REPORT';
    else if (lowerName.includes('charge')) detectedType = 'CHARGE_SHEET';
    else if (lowerName.includes('court') || lowerName.includes('order')) detectedType = 'COURT_FILING';
    else if (lowerName.includes('notice')) detectedType = 'LEGAL_NOTICE';

    // Sensitivity classification rule:
    // WITNESS_STATEMENT or witness-related text -> Sensitivity A
    // FIR, FORENSIC_REPORT, INVESTIGATION_REPORT -> Sensitivity B
    // Else -> Sensitivity C
    let sensitivity: SensitivityLevel = 'C';
    if (detectedType === 'WITNESS_STATEMENT') {
      sensitivity = 'A';
    } else if (
      detectedType === 'FIR' ||
      detectedType === 'FORENSIC_REPORT' ||
      detectedType === 'INVESTIGATION_REPORT' ||
      detectedType === 'CHARGE_SHEET'
    ) {
      sensitivity = 'B';
    }

    // SHA-256 computed on raw file bytes before encryption (rule-hash-on-raw-bytes-before-encryption)
    const rawHash = generateMockSha256(`${file.name}-${file.size}-${Date.now()}`);
    const signature = `RSA2048-SIG-${Date.now().toString(16).toUpperCase()}-${rawHash.slice(0, 16).toUpperCase()}`;
    const minioPath = `/evidence-vault/${caseId}/${fileId}/v1/encrypted`;

    const newDoc: DocumentRecord = {
      file_id: fileId,
      case_id: caseId,
      uploader_id: uploaderId,
      uploader_name: uploaderName,
      title: `[SYNTHETIC] ${file.name.replace(/\.[^/.]+$/, '')}`,
      doc_type: detectedType,
      sensitivity_level: sensitivity,
      original_hash: rawHash,
      computed_hash: rawHash,
      system_signature: signature,
      minio_path: minioPath,
      ocr_text: `[SYNTHETIC OCR EXTRACTED TEXT]\nFile: ${file.name}\nSize: ${file.size} bytes\nProcessed via Tesseract OCR (eng+hin).\nText excerpt: Investigation material concerning ${caseId}. Verified against statutory protocols.`,
      metadata: {
        case_id_reference: caseId,
        document_date: new Date().toLocaleDateString('en-GB'),
        issuing_department: 'ICJS Evidence Intake Directorate',
        author_name: uploaderName,
        mentioned_entities: ['Special Investigation Team', 'Zonal Police Station'],
        ai_extracted: true,
        file_size_bytes: file.size,
        mime_type: file.type || 'application/pdf',
      },
      classification_confidence: 0.96,
      flags: {
        ocr_low_confidence: false,
        classification_needs_review: false,
      },
      version: 1,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      is_synthetic: true,
    };

    // Store in mock db
    db.documents.unshift(newDoc);

    // Initial version
    db.versions.unshift({
      version_id: `ver-${fileId}-1`,
      file_id: fileId,
      version_number: 1,
      hash: rawHash,
      minio_path: minioPath,
      created_by: uploaderId,
      created_by_name: uploaderName,
      created_at: new Date().toISOString(),
      change_summary: 'Initial Ingest & Envelope Encryption',
    });

    // Blockchain event registration (rule-blockchain-event-after-confirmed-storage)
    db.blockchainEvents.unshift({
      event_id: `blk-${Date.now()}`,
      event_type: 'UPLOAD',
      doc_id: fileId,
      case_id: caseId,
      hash: rawHash,
      version: 1,
      actor_id: uploaderId,
      actor_name: uploaderName,
      timestamp: new Date().toISOString(),
    });

    // Update case counts
    const parentCase = db.cases.find((c) => c.case_id === caseId);
    if (parentCase) {
      parentCase.document_counts.total += 1;
      if (sensitivity === 'A') parentCase.document_counts.sensitivity_a += 1;
      else if (sensitivity === 'B') parentCase.document_counts.sensitivity_b += 1;
      else parentCase.document_counts.sensitivity_c += 1;
    }

    // Append to immutable audit log (rule-immutable-audit-log)
    db.logAudit({
      user_id: uploaderId,
      username: uploaderName,
      action: 'DOCUMENT_UPLOADED',
      doc_id: fileId,
      case_id: caseId,
      ip_address: '10.14.22.8',
      metadata: {
        doc_type: detectedType,
        sensitivity_level: sensitivity,
        file_size_bytes: file.size,
        classification_confidence: 0.96,
      },
    });

    return {
      file_id: fileId,
      doc_type: detectedType,
      sensitivity_level: sensitivity,
      classification_confidence: 0.96,
      original_hash: rawHash,
      version: 1,
      status: 'INGESTED',
      flags: newDoc.flags,
      minio_path: minioPath,
      requires_human_verification: true,
    };
  },

  /**
   * Versioning workflow: Re-upload a corrected version without deleting prior version
   * (rule-version-on-document-change)
   */
  async uploadNewVersion(
    docId: string,
    file: File,
    userId: string,
    username: string,
    changeSummary: string
  ): Promise<DocumentRecord> {
    await delay(400);

    const doc = db.documents.find((d) => d.file_id === docId);
    if (!doc) throw new Error('Document not found');

    const nextVersion = doc.version + 1;
    const newHash = generateMockSha256(`${file.name}-v${nextVersion}-${Date.now()}`);
    const newMinioPath = `/evidence-vault/${doc.case_id}/${docId}/v${nextVersion}/encrypted`;

    // Add to version history
    db.versions.unshift({
      version_id: `ver-${docId}-${nextVersion}`,
      file_id: docId,
      version_number: nextVersion,
      hash: newHash,
      minio_path: newMinioPath,
      created_by: userId,
      created_by_name: username,
      created_at: new Date().toISOString(),
      change_summary: changeSummary || `Version ${nextVersion} update`,
    });

    // Register blockchain event
    db.blockchainEvents.unshift({
      event_id: `blk-${Date.now()}`,
      event_type: 'VERSION_CREATED',
      doc_id: docId,
      case_id: doc.case_id,
      hash: newHash,
      version: nextVersion,
      actor_id: userId,
      actor_name: username,
      timestamp: new Date().toISOString(),
    });

    // Update active document reference (retains same original_hash for initial provenance anchor)
    doc.version = nextVersion;
    doc.computed_hash = newHash;
    doc.minio_path = newMinioPath;

    db.logAudit({
      user_id: userId,
      username,
      action: 'DOCUMENT_UPLOADED',
      doc_id: docId,
      case_id: doc.case_id,
      ip_address: '10.14.22.8',
      metadata: { action: 'NEW_VERSION_CREATED', version: nextVersion, hash: newHash },
    });

    return { ...doc };
  },

  /**
   * Download document: logs to immutable audit trail, decrypts mock blob
   */
  async downloadDocument(docId: string, userId: string, username: string): Promise<Blob> {
    await delay(250);

    const doc = db.documents.find((d) => d.file_id === docId);
    if (!doc) throw new Error('Document not found');

    db.logAudit({
      user_id: userId,
      username,
      action: 'DOCUMENT_DOWNLOADED',
      doc_id: doc.file_id,
      case_id: doc.case_id,
      ip_address: '10.14.22.8',
      metadata: {
        hash: doc.original_hash,
        version: doc.version,
        sensitivity_level: doc.sensitivity_level,
      },
    });

    // Return a dummy synthetic text/pdf blob
    const content = `[ICJS ENCRYPTED EVIDENCE DECRYPTED STREAM]\nDocument ID: ${doc.file_id}\nTitle: ${doc.title}\nSensitivity: Level ${doc.sensitivity_level}\nOriginal SHA-256: ${doc.original_hash}\nSystem Signature: ${doc.system_signature}\n\n=== OCR EXTRACTED EVIDENCE BODY ===\n${doc.ocr_text}`;
    return new Blob([content], { type: 'text/plain;charset=utf-8' });
  },

  /**
   * First-open acknowledgment tracking
   */
  async acknowledgeFirstOpen(docId: string, userId: string, username: string): Promise<void> {
    const doc = db.documents.find((d) => d.file_id === docId);
    if (!doc) return;

    db.logAudit({
      user_id: userId,
      username,
      action: 'DOCUMENT_FIRST_OPENED',
      doc_id: docId,
      case_id: doc.case_id,
      ip_address: '10.14.22.8',
      metadata: { acknowledgement: 'RECIPIENT_ACKNOWLEDGED' },
    });
  },

  /**
   * Toggle simulated tamper status (for demo/testing court verification alert)
   */
  async toggleTamperSimulation(docId: string): Promise<DocumentRecord> {
    const doc = db.documents.find((d) => d.file_id === docId);
    if (!doc) throw new Error('Document not found');

    if (doc.flags.tamper_detected) {
      doc.flags.tamper_detected = false;
      doc.computed_hash = doc.original_hash;
    } else {
      doc.flags.tamper_detected = true;
      // Alter computed hash to force mismatch
      doc.computed_hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    }

    return { ...doc };
  },

  /**
   * List anomaly detection alerts (workflow-anomaly-detection)
   */
  async getAnomalyAlerts(): Promise<AnomalyAlert[]> {
    await delay(100);
    return [...db.anomalies];
  },
};
