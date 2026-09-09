import React from 'react';
import { DocumentRecord } from '@/types/document.types';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { TamperBadge } from './TamperBadge';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { Card } from '@/components/ui/Card';
import { formatDate, formatRelativeTime } from '@/utils/formatDate';
import { Eye, Download, Share2, Clock, Lock, FileCode, Bug } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { canViewDocument, canDownloadDocument, canInitiateShare } from '@/utils/roleGuard';

export interface DocumentCardProps {
  document: DocumentRecord;
  onView: (doc: DocumentRecord) => void;
  onDownload: (doc: DocumentRecord) => void;
  onShare: (doc: DocumentRecord) => void;
  onToggleTamper?: (docId: string) => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document: doc,
  onView,
  onDownload,
  onShare,
  onToggleTamper,
}) => {
  const { user } = useAuth();

  const viewPerm = canViewDocument(user, doc);
  const downloadPerm = canDownloadDocument(user, doc);
  const sharePerm = canInitiateShare(user, doc);

  const isTampered =
    Boolean(doc.flags.tamper_detected) || doc.original_hash !== doc.computed_hash;

  return (
    <Card
      className={`relative flex flex-col justify-between border transition-all duration-150 hover:border-border-strong ${
        isTampered
          ? 'border-accent-danger/70 bg-accent-danger/5 ring-1 ring-accent-danger/30'
          : 'bg-bg-card'
      }`}
    >
      {/* Top Bar: Tamper Status (unmissable) & Sensitivity Badge */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/80">
        <TamperBadge status={isTampered ? 'TAMPERED' : 'VERIFIED'} size="sm" />
        <div className="flex items-center gap-1.5">
          <SensitivityBadge level={doc.sensitivity_level} size="sm" />
          {/* Developer/Testing toggle to simulate tamper alert */}
          {onToggleTamper && (
            <Tooltip content="Developer: Toggle simulated hash mismatch/tamper state">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTamper(doc.file_id);
                }}
                className="p-1 text-text-muted hover:text-accent-danger transition-colors rounded"
                title="Toggle tamper simulation"
              >
                <Bug className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Main Card Content */}
      <div className="py-3 flex-1">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h4
            className="text-h3 font-semibold text-text-primary line-clamp-2 hover:text-accent-primary transition-colors cursor-pointer"
            onClick={() => viewPerm.allowed && onView(doc)}
          >
            {doc.title}
          </h4>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted mb-2.5">
          <span className="font-mono text-accent-primary">{doc.doc_type}</span>
          <span>•</span>
          <span>v{doc.version}</span>
          <span>•</span>
          <span>{formatDate(doc.created_at)}</span>
        </div>

        {/* Access Expiry Indicator if time-limited */}
        {doc.access_expiry && (
          <div className="flex items-center gap-1.5 text-xs text-accent-warning bg-accent-warning/10 border border-accent-warning/20 px-2 py-1 rounded-btn mb-2.5">
            <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            <span>Scoped Access expires {formatRelativeTime(doc.access_expiry)}</span>
          </div>
        )}

        {/* Truncated Hash representation */}
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted bg-bg-elevated/70 p-1.5 rounded border border-border">
          <FileCode className="w-3 h-3 text-text-muted shrink-0" />
          <span className="truncate select-all" title={doc.original_hash}>
            SHA: {doc.original_hash.slice(0, 16)}...{doc.original_hash.slice(-8)}
          </span>
        </div>
      </div>

      {/* Action Buttons with ABAC enforcement (never hide silently, show locked state with tooltip) */}
      <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
        {/* View Action */}
        <Tooltip content={!viewPerm.allowed ? viewPerm.reason : 'Inspect document in secure viewer'}>
          <Button
            size="sm"
            variant={viewPerm.allowed ? 'primary' : 'secondary'}
            disabled={!viewPerm.allowed}
            onClick={() => onView(doc)}
            leftIcon={
              !viewPerm.allowed ? <Lock className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />
            }
            className="flex-1"
          >
            {!viewPerm.allowed ? 'Locked' : 'View'}
          </Button>
        </Tooltip>

        {/* Download Action */}
        <Tooltip
          content={
            !downloadPerm.allowed
              ? downloadPerm.reason
              : 'Download decrypted evidence blob (audited)'
          }
        >
          <Button
            size="sm"
            variant="secondary"
            disabled={!downloadPerm.allowed}
            onClick={() => onDownload(doc)}
            leftIcon={
              !downloadPerm.allowed ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )
            }
          >
            Download
          </Button>
        </Tooltip>

        {/* Share Action (Dual-auth trigger if Sensitivity-A) */}
        <Tooltip
          content={
            !sharePerm.allowed
              ? sharePerm.reason
              : doc.sensitivity_level === 'A'
              ? 'Initiate share (Triggers supervisor dual-authorization)'
              : 'Share under controlled consent receipt'
          }
        >
          <Button
            size="sm"
            variant="secondary"
            disabled={!sharePerm.allowed}
            onClick={() => onShare(doc)}
            leftIcon={
              !sharePerm.allowed ? <Lock className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />
            }
          >
            Share
          </Button>
        </Tooltip>
      </div>
    </Card>
  );
};
