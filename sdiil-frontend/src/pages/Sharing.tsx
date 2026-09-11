import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/services/supabase.client';
import { sharingService } from '@/services/sharing.service';
import { documentsService } from '@/services/documents.service';
import { db } from '@/services/api';
import { SharingApproval, ConsentReceipt, DocumentRecord } from '@/types/document.types';
import { ApprovalCard } from '@/components/sharing/ApprovalCard';
import { ConsentReceiptCard } from '@/components/sharing/ConsentReceiptCard';
import { ShareModal } from '@/components/sharing/ShareModal';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { Share2, ShieldAlert, FileCheck, Plus, RefreshCw, FileText } from 'lucide-react';

export interface SharingPageProps {
  onSelectDoc?: (docId: string) => void;
}

export const Sharing: React.FC<SharingPageProps> = () => {
  const { user } = useAuth();
  const [pendingApprovals, setPendingApprovals] = useState<SharingApproval[]>([]);
  const [receipts, setReceipts] = useState<ConsentReceipt[]>([]);
  const [availableDocs, setAvailableDocs] = useState<DocumentRecord[]>([]);
  const [selectedDocForShare, setSelectedDocForShare] = useState<DocumentRecord | null>(null);
  const [isDocPickerOpen, setIsDocPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (user?.role === 'SUPERVISOR' || user?.role === 'ADMIN') {
        const approvals = await sharingService.getPendingApprovals();
        setPendingApprovals(approvals);
      } else {
        setPendingApprovals([]);
      }

      const history = await sharingService.getSharingHistory();
      setReceipts(history);

      // Load documents from assigned cases for sharing
      if (user?.case_ids && user.case_ids.length > 0) {
        const docs = await documentsService.getDocumentsByCase(user.case_ids[0]);
        setAvailableDocs(docs.length > 0 ? docs : db.documents);
      } else {
        setAvailableDocs(db.documents);
      }
    } catch (err) {
      console.warn('[SharingPage] Load data notice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Supabase Realtime channel subscription for instant sync across tabs
    const channel = supabase
      .channel('sharing_realtime_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sharing_events' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approvals' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  const handleOpenShareInitiator = () => {
    if (availableDocs.length === 1) {
      setSelectedDocForShare(availableDocs[0]);
    } else {
      setIsDocPickerOpen(true);
    }
  };

  const handleSelectDocFromPicker = (doc: DocumentRecord) => {
    setIsDocPickerOpen(false);
    setSelectedDocForShare(doc);
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

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            isLoading={isLoading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>

          {user?.role !== 'COURT_REGISTRAR' && user?.role !== 'REVIEWER' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenShareInitiator}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Initiate Document Share
            </Button>
          )}
        </div>
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

      {/* Document Selection Modal (when initiating share from Sharing page) */}
      <Modal
        isOpen={isDocPickerOpen}
        onClose={() => setIsDocPickerOpen(false)}
        title="Select Evidence Document to Share"
        subtitle="Choose an authorized case document to provision scoped inter-agency access"
        maxWidth="lg"
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {availableDocs.map((doc) => (
            <div
              key={doc.file_id}
              onClick={() => handleSelectDocFromPicker(doc)}
              className="flex items-center justify-between p-3 rounded-card bg-bg-secondary border border-border hover:border-accent-primary cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-8 h-8 rounded bg-bg-elevated border border-border flex items-center justify-center text-accent-primary shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-text-primary truncate">{doc.title}</h4>
                  <div className="text-xs text-text-muted mt-0.5">
                    Type: {doc.doc_type} • Case: {doc.case_id} • v{doc.version}
                  </div>
                </div>
              </div>
              <SensitivityBadge level={doc.sensitivity_level} showDetails />
            </div>
          ))}
        </div>
      </Modal>

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
