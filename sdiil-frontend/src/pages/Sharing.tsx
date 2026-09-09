import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/services/api';
import { sharingService } from '@/services/sharing.service';
import { SharingApproval, ConsentReceipt, DocumentRecord } from '@/types/document.types';
import { ApprovalCard } from '@/components/sharing/ApprovalCard';
import { ConsentReceiptCard } from '@/components/sharing/ConsentReceiptCard';
import { ShareModal } from '@/components/sharing/ShareModal';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Share2, ShieldAlert, FileCheck, Plus } from 'lucide-react';

export interface SharingPageProps {
  onSelectDoc?: (docId: string) => void;
}

export const Sharing: React.FC<SharingPageProps> = () => {
  const { user } = useAuth();
  const [pendingApprovals, setPendingApprovals] = useState<SharingApproval[]>([]);
  const [receipts, setReceipts] = useState<ConsentReceipt[]>([]);
  const [selectedDocForShare, setSelectedDocForShare] = useState<DocumentRecord | null>(null);

  const loadData = async () => {
    const approvals = await sharingService.getPendingApprovals();
    setPendingApprovals(approvals);
    setReceipts([...db.receipts]);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleApprove = async (approvalId: string) => {
    if (!user) return;
    await sharingService.approveShare(
      approvalId,
      user.user_id,
      user.full_name || user.username
    );
    await loadData();
  };

  const handleReject = async (approvalId: string, reason: string) => {
    if (!user) return;
    await sharingService.rejectShare(
      approvalId,
      user.user_id,
      user.full_name || user.username,
      reason
    );
    await loadData();
  };

  const isSupervisorOrAdmin = user?.role === 'SUPERVISOR' || user?.role === 'ADMIN';

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-h1 font-bold text-text-primary flex items-center gap-2.5">
            <Share2 className="w-6 h-6 text-accent-primary" />
            Controlled Inter-Pillar Sharing & Consent
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Statutory time-limited sharing, supervisor dual-authorization for Level A, and signed consent receipts.
          </p>
        </div>

        {/* Quick share button */}
        {user?.role !== 'COURT_REGISTRAR' && user?.role !== 'REVIEWER' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setSelectedDocForShare(db.documents[0])}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Initiate Document Share
          </Button>
        )}
      </div>

      {/* Supervisor/Admin Dual-Auth Approval Queue */}
      {isSupervisorOrAdmin && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-accent-danger" />
              <h3 className="text-h3 font-semibold text-text-primary">
                Pending Supervisor Dual-Authorization Queue
              </h3>
            </div>
            <span className="text-xs font-mono text-accent-danger font-semibold bg-accent-danger/10 px-2 py-0.5 rounded border border-accent-danger/30">
              {pendingApprovals.length} Pending
            </span>
          </div>

          {pendingApprovals.length === 0 ? (
            <Card className="p-4 text-center text-xs text-text-muted">
              No pending Sensitivity-A share requests awaiting dual-authorization.
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {pendingApprovals.map((approval) => (
                <ApprovalCard
                  key={approval.approval_id}
                  approval={approval}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Verifiable Consent Receipts Register */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-accent-success" />
            <h3 className="text-h3 font-semibold text-text-primary">
              Immutable Sharing Events & Signed Consent Receipts
            </h3>
          </div>
          <span className="text-xs text-text-muted font-mono">{receipts.length} Registered</span>
        </div>

        {receipts.length === 0 ? (
          <Card className="py-8 text-center text-xs text-text-muted">
            No active document shares recorded in this node.
          </Card>
        ) : (
          <div className="space-y-3">
            {receipts.map((rcpt) => (
              <ConsentReceiptCard key={rcpt.event_id} receipt={rcpt} />
            ))}
          </div>
        )}
      </div>

      {/* Share Modal */}
      {selectedDocForShare && (
        <ShareModal
          isOpen={Boolean(selectedDocForShare)}
          onClose={() => setSelectedDocForShare(null)}
          document={selectedDocForShare}
          onSuccess={loadData}
        />
      )}
    </div>
  );
};
