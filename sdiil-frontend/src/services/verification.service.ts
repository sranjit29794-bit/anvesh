import { db, delay } from './api';
import { TamperVerificationResult } from '@/types/document.types';

export const verificationService = {
  /**
   * Run full court-ready tamper verification on a document
   * (workflow-tamper-verification-report)
   */
  async verifyDocument(
    caseId: string,
    docId: string,
    userId: string,
    username: string
  ): Promise<TamperVerificationResult> {
    await delay(350);

    const doc = db.documents.find((d) => d.file_id === docId);
    if (!doc) throw new Error('Document not found in vault');

    // Audit request
    db.logAudit({
      user_id: userId,
      username,
      action: 'VERIFICATION_REQUESTED',
      doc_id: docId,
      case_id: caseId,
      ip_address: '10.14.22.8',
    });

    const isTampered =
      Boolean(doc.flags.tamper_detected) || doc.original_hash !== doc.computed_hash;

    const blockchainEventsCount = db.blockchainEvents.filter((b) => b.doc_id === docId).length;
    const auditEventsCount = db.auditLogs.filter((a) => a.doc_id === docId).length;
    const sharingEventsCount = db.receipts.filter((r) => r.doc_id === docId).length;

    // Log verification report generation
    db.logAudit({
      user_id: userId,
      username,
      action: 'VERIFICATION_REPORT_GENERATED',
      doc_id: docId,
      case_id: caseId,
      ip_address: '10.14.22.8',
      metadata: { status: isTampered ? 'TAMPERED' : 'VERIFIED' },
    });

    return {
      doc_id: doc.file_id,
      case_id: doc.case_id,
      verification_status: isTampered ? 'TAMPERED' : 'VERIFIED',
      original_hash: doc.original_hash,
      computed_hash: doc.computed_hash || doc.original_hash,
      hashes_match: !isTampered,
      storage_integrity_failure: isTampered,
      system_signature: doc.system_signature,
      blockchain_events_count: blockchainEventsCount,
      audit_events_count: auditEventsCount,
      sharing_events_count: sharingEventsCount,
      report_url: `/evidence-vault/${caseId}/${docId}/reports/verification_${Date.now()}.pdf`,
      generated_at: new Date().toISOString(),
      checked_at: new Date().toISOString(),
      requires_human_verification: true,
    };
  },

  /**
   * Public independent verification check (used by court QR scanners without login)
   * (public-verify-endpoint in workflow-tamper-verification-report)
   * Strictly returns only status and timestamps, no document content.
   */
  async publicVerifyHash(
    docId: string,
    hash: string
  ): Promise<{
    verification_status: 'VERIFIED' | 'TAMPERED';
    doc_id: string;
    registered_at: string;
    checked_at: string;
  }> {
    await delay(200);

    const doc = db.documents.find((d) => d.file_id === docId);
    if (!doc) {
      return {
        verification_status: 'TAMPERED',
        doc_id: docId,
        registered_at: 'NOT_FOUND',
        checked_at: new Date().toISOString(),
      };
    }

    const matches = doc.original_hash === hash && !doc.flags.tamper_detected;

    return {
      verification_status: matches ? 'VERIFIED' : 'TAMPERED',
      doc_id: doc.file_id,
      registered_at: doc.created_at,
      checked_at: new Date().toISOString(),
    };
  },
};
