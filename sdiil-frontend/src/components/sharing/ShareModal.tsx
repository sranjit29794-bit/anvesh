import React, { useState } from 'react';
import { DocumentRecord, ConsentReceipt, SharingApproval } from '@/types/document.types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { ConsentReceiptCard } from './ConsentReceiptCard';
import { sharingService } from '@/services/sharing.service';
import { useAuth } from '@/hooks/useAuth';
import { INITIAL_USERS } from '@/services/api';
import { Share2, ShieldAlert } from 'lucide-react';

export interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentRecord | null;
  onSuccess?: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  document: doc,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [recipientUserId, setRecipientUserId] = useState<string>('usr-004'); // default Kavita Sen (Prosecutor)
  const [shareReason, setShareReason] = useState<string>('');
  const [expiryHours, setExpiryHours] = useState<number>(48);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dualAuthPending, setDualAuthPending] = useState<SharingApproval | null>(null);
  const [generatedReceipt, setGeneratedReceipt] = useState<ConsentReceipt | null>(null);

  if (!doc) return null;

  const isSensitivityA = doc.sensitivity_level === 'A';

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !shareReason.trim()) return;

    setIsLoading(true);
    setError(null);

    const selectedRecipient = INITIAL_USERS.find((u) => u.user_id === recipientUserId);

    try {
      const res = await sharingService.initiateShare({
        doc,
        initiatorId: user.user_id,
        initiatorName: user.full_name || user.username,
        initiatorRole: user.role,
        recipientUserId: selectedRecipient?.user_id,
        recipientName: selectedRecipient?.full_name,
        recipientRole: selectedRecipient?.role || 'PROSECUTOR',
        shareReason,
        expiryHours,
      });

      if (res.status === 'PENDING_APPROVAL' && res.approval) {
        setDualAuthPending(res.approval);
      } else if (res.receipt) {
        setGeneratedReceipt(res.receipt);
      }

      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Share initiation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setDualAuthPending(null);
    setGeneratedReceipt(null);
    setShareReason('');
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleResetAndClose}
      title="Initiate Controlled Document Share"
      subtitle={`Case: ${doc.case_id} • Target Document: ${doc.file_id}`}
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Document Header */}
        <div className="flex items-center justify-between p-3 rounded-card bg-bg-secondary border border-border">
          <div className="min-w-0 pr-2">
            <h4 className="text-sm font-semibold text-text-primary truncate">{doc.title}</h4>
            <div className="text-xs text-text-muted mt-0.5">
              Type: {doc.doc_type} • Version: v{doc.version}
            </div>
          </div>
          <SensitivityBadge level={doc.sensitivity_level} showDetails />
        </div>

        {/* Dual-auth prompt if Sensitivity-A */}
        {isSensitivityA && !dualAuthPending && !generatedReceipt && (
          <Alert variant="warning" title="Dual-Authorization Required (Rule-Dual-Auth)">
            This document is classified as <strong>Sensitivity-A</strong>. Submitting this share
            will not immediately grant access; it routes to a <strong>Supervisor or Admin</strong>{' '}
            for explicit approval before any recipient policy or consent receipt is written.
          </Alert>
        )}

        {error && <Alert variant="danger">{error}</Alert>}

        {/* State 1: Dual-Auth Pending state */}
        {dualAuthPending && (
          <div className="space-y-4">
            <div className="p-4 rounded-card bg-accent-warning/10 border border-accent-warning/40 space-y-3">
              <div className="flex items-center gap-2 text-accent-warning font-semibold text-sm">
                <ShieldAlert className="w-5 h-5" />
                <span>Approval Request Dispatched (ID: {dualAuthPending.approval_id})</span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Your share request for Sensitivity-A material has halted in <strong>PENDING</strong>{' '}
                status. Notifications have been dispatched to all assigned Case Supervisors. Access
                will be provisioned once approved.
              </p>
            </div>

            <div className="flex justify-end">
              <Button variant="primary" onClick={handleResetAndClose}>
                Done
              </Button>
            </div>
          </div>
        )}

        {/* State 2: Finished Consent Receipt */}
        {generatedReceipt && (
          <div className="space-y-4">
            <ConsentReceiptCard receipt={generatedReceipt} />
            <div className="flex justify-end">
              <Button variant="primary" onClick={handleResetAndClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* State 3: Input Form */}
        {!dualAuthPending && !generatedReceipt && (
          <form onSubmit={handleShareSubmit} className="space-y-4">
            <div>
              <label className="text-label text-text-secondary block mb-1.5">
                Target Recipient / Inter-Pillar Agency
              </label>
              <select
                value={recipientUserId}
                onChange={(e) => setRecipientUserId(e.target.value)}
                className="w-full bg-bg-elevated text-text-primary border border-border rounded-input text-body p-2 outline-none focus:border-accent-primary"
              >
                {INITIAL_USERS.filter((u) => u.user_id !== user?.user_id).map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.full_name} ({u.role}) — {u.department}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-label text-text-secondary block mb-1.5">
                Time-Limited Access Window
              </label>
              <select
                value={expiryHours}
                onChange={(e) => setExpiryHours(Number(e.target.value))}
                className="w-full bg-bg-elevated text-text-primary border border-border rounded-input text-body p-2 outline-none focus:border-accent-primary"
              >
                <option value={12}>12 Hours (Urgent Interrogation / Review)</option>
                <option value={24}>24 Hours (Standard Remand Hearing)</option>
                <option value={48}>48 Hours (Charge Sheet Finalization)</option>
                <option value={72}>72 Hours (Court Briefing)</option>
                <option value={168}>168 Hours / 7 Days (Statutory Maximum)</option>
              </select>
            </div>

            <Input
              label="Statutory Share Justification / Case Reason"
              value={shareReason}
              onChange={(e) => setShareReason(e.target.value)}
              placeholder="e.g., Cross-examination prep under Section 173 CrPC"
              required
              helperText="This statement is immutably sealed in the signed consent receipt artifact."
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={handleResetAndClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                leftIcon={isSensitivityA ? <ShieldAlert className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              >
                {isSensitivityA ? 'Submit for Supervisor Approval' : 'Grant Scoped Access'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
