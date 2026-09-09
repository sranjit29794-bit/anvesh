import { db, delay } from './api';
import { SharingApproval, ConsentReceipt, DocumentRecord } from '@/types/document.types';

export const sharingService = {
  /**
   * List pending approvals for a case (for SUPERVISOR and ADMIN roles)
   */
  async getPendingApprovals(caseId?: string): Promise<SharingApproval[]> {
    await delay(120);
    return db.approvals.filter(
      (a) => a.status === 'PENDING' && (!caseId || a.case_id === caseId)
    );
  },

  /**
   * List sharing history/receipts for a document
   */
  async getSharingHistory(docId: string): Promise<ConsentReceipt[]> {
    await delay(120);
    return db.receipts.filter((r) => r.doc_id === docId);
  },

  /**
   * Initiate document sharing (workflow-controlled-sharing)
   * If Sensitivity-A: generates PENDING approval record and halts.
   * If Sensitivity-B/C: immediately generates signed consent receipt and grants access.
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
    await delay(400);

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

    // Dual authorization check for Sensitivity A (rule-dual-authorization-for-sensitivity-a)
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

      db.logAudit({
        user_id: initiatorId,
        username: initiatorName,
        action: 'SHARE_INITIATED',
        doc_id: doc.file_id,
        case_id: doc.case_id,
        ip_address: '10.14.22.8',
        metadata: {
          requires_dual_auth: true,
          approval_id: approval.approval_id,
          recipient: recipientName || recipientRole,
        },
      });

      return { status: 'PENDING_APPROVAL', approval };
    }

    // For Sensitivity B or C, proceed directly to consent receipt & grant access
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
   */
  async approveShare(
    approvalId: string,
    approverId: string,
    approverName: string
  ): Promise<ConsentReceipt> {
    await delay(350);

    const approval = db.approvals.find((a) => a.approval_id === approvalId);
    if (!approval) throw new Error('Approval request not found');

    const doc = db.documents.find((d) => d.file_id === approval.doc_id);
    if (!doc) throw new Error('Document record not found');

    approval.status = 'APPROVED';
    approval.resolved_at = new Date().toISOString();
    approval.resolved_by = approverId;
    approval.resolved_by_name = approverName;

    db.logAudit({
      user_id: approverId,
      username: approverName,
      action: 'SHARE_APPROVED',
      doc_id: approval.doc_id,
      case_id: approval.case_id,
      ip_address: '10.14.22.8',
      metadata: { approval_id: approvalId, recipient: approval.recipient_name || approval.recipient_role },
    });

    // Generate consent receipt now that approval is confirmed
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
   */
  async rejectShare(
    approvalId: string,
    approverId: string,
    approverName: string,
    rejectReason: string
  ): Promise<SharingApproval> {
    await delay(250);

    const approval = db.approvals.find((a) => a.approval_id === approvalId);
    if (!approval) throw new Error('Approval request not found');

    approval.status = 'REJECTED';
    approval.resolved_at = new Date().toISOString();
    approval.resolved_by = approverId;
    approval.resolved_by_name = approverName;

    db.logAudit({
      user_id: approverId,
      username: approverName,
      action: 'SHARE_REJECTED',
      doc_id: approval.doc_id,
      case_id: approval.case_id,
      ip_address: '10.14.22.8',
      metadata: { approval_id: approvalId, reject_reason: rejectReason },
    });

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
    const receiptSignature = `RSA-SIG-RECEIPT-${Date.now().toString(16).toUpperCase()}`;

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

    // Register blockchain sharing event
    db.blockchainEvents.unshift({
      event_id: `blk-${Date.now()}`,
      event_type: 'DOCUMENT_SHARED',
      doc_id: params.doc.file_id,
      case_id: params.doc.case_id,
      hash: receiptHash,
      version: params.doc.version,
      actor_id: params.initiatorId,
      actor_name: params.initiatorName,
      timestamp: new Date().toISOString(),
    });

    // Write to immutable audit log
    db.logAudit({
      user_id: params.initiatorId,
      username: params.initiatorName,
      action: 'DOCUMENT_SHARED',
      doc_id: params.doc.file_id,
      case_id: params.doc.case_id,
      ip_address: '10.14.22.8',
      metadata: {
        receipt_hash: receiptHash,
        valid_until: validUntil,
        recipient: params.recipientName || params.recipientRole,
      },
    });

    return receipt;
  },
};
