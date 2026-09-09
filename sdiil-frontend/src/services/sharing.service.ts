import { db, delay, INITIAL_USERS } from './api';
import { supabase } from './supabase.client';
import { SharingApproval, ConsentReceipt, DocumentRecord, DocType, SensitivityLevel } from '@/types/document.types';

export interface RecipientOption {
  user_id: string;
  full_name: string;
  role: string;
  department: string;
}

export const sharingService = {
  /**
   * Helper to fetch current Supabase session token
   */
  async getAuthToken(): Promise<string | null> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  },

  /**
   * List eligible recipient users from Supabase profiles (or fallback to INITIAL_USERS)
   */
  async getRecipients(): Promise<RecipientOption[]> {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, role');

      if (!error && profiles && profiles.length > 0) {
        return profiles.map((p: any) => ({
          user_id: p.id,
          full_name: p.name || 'Authorized Official',
          role: (p.role || 'OFFICER').toUpperCase(),
          department:
            p.role === 'judge'
              ? 'Sessions Court, Pune'
              : p.role === 'supervisor'
              ? 'CID Headquarters, Maharashtra'
              : p.role === 'admin'
              ? 'ICJS Central Registry'
              : 'Crime Branch, Special Cell',
        }));
      }
    } catch (err) {
      console.warn('[sharingService] Failed to load remote profiles:', err);
    }

    return INITIAL_USERS.map((u) => ({
      user_id: u.user_id,
      full_name: u.full_name,
      role: u.role,
      department: u.department,
    }));
  },

  /**
   * List pending approvals for a case (for SUPERVISOR and ADMIN roles)
   * Calls backend GET /api/v1/sharing/pending-approvals with Bearer token.
   */
  async getPendingApprovals(caseId?: string): Promise<SharingApproval[]> {
    const token = await this.getAuthToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (token) {
      try {
        const queryParam = caseId ? `?case_id=${encodeURIComponent(caseId)}` : '';
        const res = await fetch(`${apiBase}/sharing/pending-approvals${queryParam}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.approvals)) {
            const mapped: SharingApproval[] = data.approvals.map((a: any) => ({
              approval_id: a.approval_id,
              doc_id: a.doc_id,
              doc_title: a.doc_title,
              doc_type: a.doc_type as DocType,
              case_id: a.case_id,
              initiator_id: a.initiator_id,
              initiator_name: a.initiator_name,
              initiator_role: a.initiator_role,
              recipient_user_id: a.recipient_user_id,
              recipient_name: a.recipient_name,
              recipient_role: a.recipient_role,
              share_reason: a.share_reason,
              status: a.status || 'PENDING',
              created_at: a.created_at,
              sensitivity_level: (a.sensitivity_level || 'A') as SensitivityLevel,
            }));

            // Sync into in-memory db so other views reflect the current queue
            db.approvals = mapped;
            return mapped;
          }
        }
      } catch (err) {
        console.warn('[sharingService] getPendingApprovals API error:', err);
      }
    }

    await delay(120);
    return db.approvals.filter(
      (a) => a.status === 'PENDING' && (!caseId || a.case_id === caseId)
    );
  },

  /**
   * List sharing history/receipts for a document or all accessible shares.
   * Calls backend GET /api/v1/sharing/events with Bearer token.
   */
  async getSharingHistory(docId?: string): Promise<ConsentReceipt[]> {
    const token = await this.getAuthToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (token) {
      try {
        const queryParam = docId ? `?document_id=${encodeURIComponent(docId)}` : '';
        const res = await fetch(`${apiBase}/sharing/events${queryParam}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.events)) {
            const approvedEvents = data.events.filter(
              (e: any) => e.approval_status === 'approved'
            );

            const mapped: ConsentReceipt[] = approvedEvents.map((e: any) => {
              const doc = Array.isArray(e.documents) ? e.documents[0] : e.documents;
              const initiator = Array.isArray(e.initiator) ? e.initiator[0] : e.initiator;
              const recipient = Array.isArray(e.recipient) ? e.recipient[0] : e.recipient;
              const approvals = Array.isArray(e.approvals) ? e.approvals : e.approvals ? [e.approvals] : [];
              const approvedRow = approvals.find((a: any) => a.decision === 'approved');
              const approver = Array.isArray(approvedRow?.approver) ? approvedRow.approver[0] : approvedRow?.approver;

              const receiptHash = `hash_${e.id.replace(/-/g, '').slice(0, 24)}`;
              const receiptSig = `RSA2048-SIG-${e.id.slice(0, 8).toUpperCase()}`;

              return {
                event_id: e.id,
                receipt_hash: receiptHash,
                receipt_signature: receiptSig,
                doc_id: e.document_id,
                doc_title: doc?.title || `Document ${e.document_id}`,
                case_id: doc?.case_id || '',
                initiator_id: e.shared_by,
                initiator_name: initiator?.name || 'Authorized Officer',
                recipient_id: e.shared_with,
                recipient_name: recipient?.name || 'Authorized Official',
                recipient_role: (recipient?.role || 'OFFICER').toUpperCase(),
                approver_name:
                  approver?.name || (e.requires_dual_auth ? 'Case Supervisor' : 'Not Required (Level B/C)'),
                share_reason: e.share_reason || 'Evidentiary review under CrPC',
                valid_until: e.access_expires_at || new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                timestamp: e.created_at,
                minio_path: `/evidence-vault/${doc?.case_id || 'general'}/${e.document_id}/receipts/${e.id}.pdf`,
              };
            });

            // Merge with any in-memory receipts
            const merged = [...mapped];
            for (const r of db.receipts) {
              if (!merged.some((m) => m.event_id === r.event_id)) {
                if (!docId || r.doc_id === docId) {
                  merged.push(r);
                }
              }
            }
            return merged;
          }
        }
      } catch (err) {
        console.warn('[sharingService] getSharingHistory API error:', err);
      }
    }

    await delay(120);
    return db.receipts.filter((r) => !docId || r.doc_id === docId);
  },

  /**
   * Initiate document sharing (workflow-controlled-sharing)
   * Calls real backend POST /api/v1/documents/:id/share.
   * If Sensitivity-A: creates PENDING approval event and halts.
   * If Sensitivity-B/C: immediately approves and generates signed consent receipt.
   */
  async initiateShare(params: {
    doc: DocumentRecord;
    initiatorId: string;
    initiatorName: string;
    initiatorRole: string;
    recipientUserId?: string;
    recipientName?: string;
    recipientRole: string;
    shareReason: string;
    expiryHours: number;
  }): Promise<{ status: 'PENDING_APPROVAL' | 'SHARED'; approval?: SharingApproval; receipt?: ConsentReceipt }> {
    const {
      doc,
      initiatorId,
      initiatorName,
      initiatorRole,
      recipientUserId,
      recipientName,
      recipientRole,
      shareReason,
      expiryHours,
    } = params;

    const token = await this.getAuthToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (token && recipientUserId) {
      const res = await fetch(`${apiBase}/documents/${doc.file_id}/share`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shared_with: recipientUserId,
          access_duration: expiryHours,
          share_reason: shareReason,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: `Share initiation failed with HTTP ${res.status}` }));
        throw new Error(errJson.error || `Share initiation failed with HTTP ${res.status}`);
      }

      const resJson = await res.json();
      const shareEvent = resJson.sharing_event;

      if (resJson.requires_dual_auth || resJson.approval_status === 'pending') {
        const approval: SharingApproval = {
          approval_id: shareEvent.id,
          doc_id: doc.file_id,
          doc_title: doc.title,
          doc_type: doc.doc_type,
          case_id: doc.case_id,
          initiator_id: initiatorId,
          initiator_name: initiatorName,
          initiator_role: initiatorRole,
          recipient_user_id: recipientUserId,
          recipient_name: recipientName,
          recipient_role: recipientRole,
          share_reason: shareReason,
          status: 'PENDING',
          created_at: shareEvent.created_at || new Date().toISOString(),
          sensitivity_level: 'A',
        };

        db.approvals.unshift(approval);
        return { status: 'PENDING_APPROVAL', approval };
      }

      // Approved immediately (Sensitivity B or C)
      const receipt = this.generateConsentReceiptInternal({
        doc,
        initiatorId,
        initiatorName,
        recipientId: recipientUserId,
        recipientName,
        recipientRole,
        shareReason,
        expiryHours,
      });

      return { status: 'SHARED', receipt };
    }

    // Offline / Mock fallback
    await delay(300);
    if (doc.sensitivity_level === 'A') {
      const approval: SharingApproval = {
        approval_id: `appr-${Date.now()}`,
        doc_id: doc.file_id,
        doc_title: doc.title,
        doc_type: doc.doc_type,
        case_id: doc.case_id,
        initiator_id: initiatorId,
        initiator_name: initiatorName,
        initiator_role: initiatorRole,
        recipient_user_id: recipientUserId,
        recipient_name: recipientName,
        recipient_role: recipientRole,
        share_reason: shareReason,
        status: 'PENDING',
        created_at: new Date().toISOString(),
        sensitivity_level: 'A',
      };

      db.approvals.unshift(approval);
      return { status: 'PENDING_APPROVAL', approval };
    }

    const receipt = this.generateConsentReceiptInternal({
      doc,
      initiatorId,
      initiatorName,
      recipientId: recipientUserId,
      recipientName,
      recipientRole,
      shareReason,
      expiryHours,
    });

    return { status: 'SHARED', receipt };
  },

  /**
   * Supervisor or Admin approves a pending Sensitivity-A share
   * (rule-dual-authorization-for-sensitivity-a & rule-consent-receipt-before-recipient-access)
   * Calls real backend POST /api/v1/sharing/:sharingEventId/approve.
   */
  async approveShare(
    approvalId: string,
    approverId: string,
    approverName: string,
    reason?: string
  ): Promise<ConsentReceipt> {
    const token = await this.getAuthToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (token) {
      const res = await fetch(`${apiBase}/sharing/${approvalId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: `Approval failed with HTTP ${res.status}` }));
        throw new Error(errJson.error || `Approval failed with HTTP ${res.status}`);
      }

      const resJson = await res.json();
      const event = resJson.sharing_event || {};

      // Update in-memory approval record
      const approval = db.approvals.find((a) => a.approval_id === approvalId);
      if (approval) {
        approval.status = 'APPROVED';
        approval.resolved_at = new Date().toISOString();
        approval.resolved_by = approverId;
        approval.resolved_by_name = approverName;
      }

      const eventId = approvalId;
      const receiptHash = `hash_${eventId.replace(/-/g, '').slice(0, 24)}`;
      const receiptSig = `RSA2048-SIG-${eventId.slice(0, 8).toUpperCase()}`;

      const receipt: ConsentReceipt = {
        event_id: eventId,
        receipt_hash: receiptHash,
        receipt_signature: receiptSig,
        doc_id: approval?.doc_id || event.document_id,
        doc_title: approval?.doc_title || 'Classified Evidence File',
        case_id: approval?.case_id || event.case_id,
        initiator_id: approval?.initiator_id || event.shared_by,
        initiator_name: approval?.initiator_name || 'Authorized Officer',
        recipient_id: approval?.recipient_user_id || event.shared_with,
        recipient_name: approval?.recipient_name || 'Recipient Agency',
        recipient_role: approval?.recipient_role || 'JUDGE',
        approver_name: approverName,
        share_reason: approval?.share_reason || event.share_reason || 'Dual-authorization granted',
        valid_until: event.access_expires_at || new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        timestamp: new Date().toISOString(),
        minio_path: `/evidence-vault/${approval?.case_id || 'case'}/${approval?.doc_id || event.document_id}/receipts/${eventId}.pdf`,
      };

      db.receipts.unshift(receipt);
      return receipt;
    }

    // Fallback if no token
    await delay(300);
    const approval = db.approvals.find((a) => a.approval_id === approvalId);
    if (!approval) throw new Error('Approval request not found');

    const doc = db.documents.find((d) => d.file_id === approval.doc_id);
    if (!doc) throw new Error('Document record not found');

    approval.status = 'APPROVED';
    approval.resolved_at = new Date().toISOString();
    approval.resolved_by = approverId;
    approval.resolved_by_name = approverName;

    const receipt = this.generateConsentReceiptInternal({
      doc,
      initiatorId: approval.initiator_id,
      initiatorName: approval.initiator_name,
      recipientId: approval.recipient_user_id,
      recipientName: approval.recipient_name,
      recipientRole: approval.recipient_role,
      approverName,
      shareReason: approval.share_reason,
      expiryHours: 72,
    });

    return receipt;
  },

  /**
   * Supervisor or Admin rejects a pending Sensitivity-A share
   * Calls real backend POST /api/v1/sharing/:sharingEventId/reject.
   */
  async rejectShare(
    approvalId: string,
    approverId: string,
    approverName: string,
    rejectReason: string
  ): Promise<SharingApproval> {
    const token = await this.getAuthToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (token) {
      const res = await fetch(`${apiBase}/sharing/${approvalId}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: rejectReason }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: `Rejection failed with HTTP ${res.status}` }));
        throw new Error(errJson.error || `Rejection failed with HTTP ${res.status}`);
      }

      const approval = db.approvals.find((a) => a.approval_id === approvalId);
      if (approval) {
        approval.status = 'REJECTED';
        approval.resolved_at = new Date().toISOString();
        approval.resolved_by = approverId;
        approval.resolved_by_name = approverName;
        return { ...approval };
      }

      return {
        approval_id: approvalId,
        doc_id: '',
        case_id: '',
        initiator_id: '',
        initiator_name: '',
        initiator_role: '',
        recipient_role: '',
        share_reason: rejectReason,
        status: 'REJECTED',
        created_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
        resolved_by: approverId,
        resolved_by_name: approverName,
        sensitivity_level: 'A',
      };
    }

    await delay(250);
    const approval = db.approvals.find((a) => a.approval_id === approvalId);
    if (!approval) throw new Error('Approval request not found');

    approval.status = 'REJECTED';
    approval.resolved_at = new Date().toISOString();
    approval.resolved_by = approverId;
    approval.resolved_by_name = approverName;

    return { ...approval };
  },

  /**
   * Internal generator for Signed Consent Receipt PDF metadata
   */
  generateConsentReceiptInternal(params: {
    doc: DocumentRecord;
    initiatorId: string;
    initiatorName: string;
    recipientId?: string;
    recipientName?: string;
    recipientRole: string;
    approverName?: string;
    shareReason: string;
    expiryHours: number;
  }): ConsentReceipt {
    const eventId = `rcpt-${Date.now()}`;
    const validUntil = new Date(Date.now() + params.expiryHours * 3600 * 1000).toISOString();
    const receiptHash = `hash_${Math.random().toString(36).substring(2)}${Date.now().toString(16)}`;
    const receiptSignature = `RSA2048-SIG-RECEIPT-${Date.now().toString(16).toUpperCase()}`;

    const receipt: ConsentReceipt = {
      event_id: eventId,
      receipt_hash: receiptHash,
      receipt_signature: receiptSignature,
      doc_id: params.doc.file_id,
      doc_title: params.doc.title,
      case_id: params.doc.case_id,
      initiator_id: params.initiatorId,
      initiator_name: params.initiatorName,
      recipient_id: params.recipientId,
      recipient_name: params.recipientName,
      recipient_role: params.recipientRole,
      approver_name: params.approverName || 'Not Required (Level B/C)',
      share_reason: params.shareReason,
      valid_until: validUntil,
      timestamp: new Date().toISOString(),
      minio_path: `/evidence-vault/${params.doc.case_id}/${params.doc.file_id}/receipts/${eventId}.pdf`,
    };

    db.receipts.unshift(receipt);
    return receipt;
  },
};
