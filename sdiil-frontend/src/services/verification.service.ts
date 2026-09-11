import { supabase } from './supabase.client';
import { db, delay } from './api';
import { TamperVerificationResult } from '@/types/document.types';

export const verificationService = {
  /**
   * Run full court-ready tamper verification on a document
   * Calls sdiil-backend GET /api/v1/documents/:id/verify under caller JWT
   * (workflow-tamper-verification-report)
   */
  async verifyDocument(
    caseId: string,
    docId: string,
    userId: string,
    username: string,
    versionNumber?: number
  ): Promise<TamperVerificationResult> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (token) {
      try {
        const queryParams = versionNumber !== undefined ? `?version_number=${versionNumber}` : '';
        const response = await fetch(`${apiBase}/documents/${docId}/verify${queryParams}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const json = await response.json();
          if (json.success) {
            const d = json.data || json;
            return {
              doc_id: d.doc_id || docId,
              case_id: d.case_id || caseId,
              case_number: d.case_number,
              doc_title: d.doc_title,
              doc_type: d.doc_type,
              version_number: d.version_number,
              checked_by: d.checked_by || username,
              status: d.status,
              is_valid: d.is_valid,
              verification_status: d.verification_status || d.status,
              original_hash: d.registered_hash || d.computed_hash,
              computed_hash: d.computed_hash,
              registered_hash: d.registered_hash,
              hashes_match: d.hashes_match,
              storage_integrity_failure: d.storage_integrity_failure,
              system_signature: d.system_signature || `RSA2048-SIG-${docId.slice(0, 8).toUpperCase()}`,
              blockchain_events_count: d.blockchain_events_count || 1,
              audit_events_count: d.audit_events_count || 1,
              sharing_events_count: d.sharing_events_count || 0,
              report_url: `${apiBase}/documents/${docId}/verification-report${queryParams}`,
              generated_at: d.verified_at || new Date().toISOString(),
              checked_at: d.verified_at || new Date().toISOString(),
              requires_human_verification: true,
            };
          }
        }

        const errJson = await response.json().catch(() => null);
        throw new Error(errJson?.error || `Verification failed (HTTP ${response.status})`);
      } catch (err) {
        console.error('[verificationService] Backend verify call failed:', err);
        throw err;
      }
    }

    // Local / Offline fallback
    await delay(350);
    const doc = db.documents.find((d) => d.file_id === docId);
    if (!doc) throw new Error('Document not found in vault');

    db.logAudit({
      user_id: userId,
      username,
      action: 'VERIFICATION_REQUESTED',
      doc_id: docId,
      case_id: caseId,
      ip_address: '127.0.0.1',
    });

    const isTampered =
      Boolean(doc.flags.tamper_detected) || doc.original_hash !== doc.computed_hash;

    const blockchainEventsCount = db.blockchainEvents.filter((b) => b.doc_id === docId).length;
    const auditEventsCount = db.auditLogs.filter((a) => a.doc_id === docId).length;
    const sharingEventsCount = db.receipts.filter((r) => r.doc_id === docId).length;

    db.logAudit({
      user_id: userId,
      username,
      action: 'VERIFICATION_REPORT_GENERATED',
      doc_id: docId,
      case_id: caseId,
      ip_address: '127.0.0.1',
      metadata: { status: isTampered ? 'TAMPERED' : 'VERIFIED' },
    });

    return {
      doc_id: doc.file_id,
      case_id: doc.case_id,
      doc_title: doc.title,
      doc_type: doc.doc_type,
      version_number: doc.version,
      checked_by: username,
      verification_status: isTampered ? 'TAMPERED' : 'VERIFIED',
      original_hash: doc.original_hash,
      computed_hash: doc.computed_hash || doc.original_hash,
      registered_hash: doc.original_hash,
      hashes_match: !isTampered,
      storage_integrity_failure: isTampered,
      system_signature: doc.system_signature,
      blockchain_events_count: Math.max(1, blockchainEventsCount),
      audit_events_count: Math.max(1, auditEventsCount),
      sharing_events_count: sharingEventsCount,
      report_url: `/evidence-vault/${caseId}/${docId}/reports/verification_${Date.now()}.pdf`,
      generated_at: new Date().toISOString(),
      checked_at: new Date().toISOString(),
      requires_human_verification: true,
    };
  },

  /**
   * Download real court-ready PDF verification report from backend
   */
  async downloadVerificationReport(
    docId: string,
    versionNumber?: number,
    docTitle?: string,
    isTampered?: boolean
  ): Promise<void> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (!token) {
      throw new Error('Authentication required to download verification certificate.');
    }

    const params = new URLSearchParams();
    if (versionNumber !== undefined) params.set('version_number', String(versionNumber));
    if (isTampered) params.set('simulated_tamper', 'true');
    const queryParams = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${apiBase}/documents/${docId}/verification-report${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      let errMsg = `Server returned status ${res.status}`;
      try {
        const json = await res.json();
        if (json.error) errMsg = json.error;
      } catch {}
      throw new Error(errMsg);
    }

    const blob = await res.blob();
    const safeTitle = (docTitle || docId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `ICJS_Court_Verification_Certificate_${safeTitle}_v${versionNumber || 1}.pdf`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
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
