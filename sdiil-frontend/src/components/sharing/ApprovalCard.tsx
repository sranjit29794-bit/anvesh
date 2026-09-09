import React, { useState } from 'react';
import { SharingApproval } from '@/types/document.types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { formatDate } from '@/utils/formatDate';
import { ShieldAlert, CheckCircle, XCircle, Clock, User, FileText } from 'lucide-react';

export interface ApprovalCardProps {
  approval: SharingApproval;
  onApprove: (approvalId: string) => Promise<void>;
  onReject: (approvalId: string, reason: string) => Promise<void>;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  approval,
  onApprove,
  onReject,
}) => {
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  const handleApprove = async () => {
    setIsActionLoading(true);
    try {
      await onApprove(approval.approval_id);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setIsActionLoading(true);
    try {
      await onReject(approval.approval_id, rejectReason);
      setRejectMode(false);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <Card className="border-accent-danger/40 bg-accent-danger/5 space-y-3">
      <div className="flex items-start justify-between gap-2 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent-danger/15 border border-accent-danger/30 flex items-center justify-center text-accent-danger shrink-0">
            <ShieldAlert className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <span className="text-xs font-mono uppercase text-accent-danger font-semibold">
              Dual-Auth Required (Sensitivity A)
            </span>
            <h4 className="text-sm font-semibold text-text-primary">
              {approval.doc_title || `Document ${approval.doc_id}`}
            </h4>
          </div>
        </div>
        <SensitivityBadge level="A" size="sm" showDetails />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-bg-secondary p-3 rounded-card border border-border">
        <div>
          <span className="text-text-muted flex items-center gap-1">
            <User className="w-3 h-3" /> Initiated By:
          </span>
          <span className="font-medium text-text-primary mt-0.5 block">
            {approval.initiator_name} ({approval.initiator_role})
          </span>
        </div>

        <div>
          <span className="text-text-muted flex items-center gap-1">
            <User className="w-3 h-3" /> Recipient Target:
          </span>
          <span className="font-medium text-text-primary mt-0.5 block">
            {approval.recipient_name || approval.recipient_role}
          </span>
        </div>

        <div className="sm:col-span-2 pt-1">
          <span className="text-text-muted flex items-center gap-1">
            <FileText className="w-3 h-3" /> Stated Justification / Reason:
          </span>
          <span className="text-text-primary mt-0.5 block italic">
            "{approval.share_reason}"
          </span>
        </div>

        <div className="sm:col-span-2 pt-1 border-t border-border flex items-center justify-between text-[11px] text-text-muted font-mono">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> Requested at: {formatDate(approval.created_at)}
          </span>
          <span>Status: PENDING SUPERVISOR CONFIRMATION</span>
        </div>
      </div>

      {rejectMode ? (
        <div className="space-y-2 pt-1">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="State reason for rejecting access to Sensitivity-A evidence..."
            className="w-full text-xs p-2 bg-bg-elevated text-text-primary border border-accent-danger rounded-btn outline-none"
            required
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRejectMode(false)}
              disabled={isActionLoading}
            >
              Back
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleReject}
              isLoading={isActionLoading}
              disabled={!rejectReason.trim()}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setRejectMode(true)}
            disabled={isActionLoading}
            leftIcon={<XCircle className="w-3.5 h-3.5 text-accent-danger" />}
          >
            Reject Request
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleApprove}
            isLoading={isActionLoading}
            leftIcon={<CheckCircle className="w-3.5 h-3.5" />}
          >
            Confirm Dual-Auth Approval
          </Button>
        </div>
      )}
    </Card>
  );
};
