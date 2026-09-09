import React, { useEffect, useState } from 'react';
import { DocumentRecord } from '@/types/document.types';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { TamperBadge } from './TamperBadge';
import { MetadataPanel } from './MetadataPanel';
import { VersionHistory } from './VersionHistory';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { documentsService } from '@/services/documents.service';
import { useAuth } from '@/hooks/useAuth';
import { canDownloadDocument, canInitiateShare } from '@/utils/roleGuard';
import { formatRelativeTime } from '@/utils/formatDate';
import { Download, Share2, Clock, Lock, FileText, ArrowLeft, Bug } from 'lucide-react';

export interface DocumentViewerProps {
  document: DocumentRecord;
  onBack: () => void;
  onShare: (doc: DocumentRecord) => void;
  onRefresh?: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document: doc,
  onBack,
  onShare,
  onRefresh,
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'content' | 'metadata' | 'versions'>('content');

  // Acknowledge first open event for audit compliance
  useEffect(() => {
    if (user) {
      documentsService.acknowledgeFirstOpen(doc.file_id, user.user_id, user.full_name || user.username);
    }
  }, [doc.file_id, user]);

  const downloadPerm = canDownloadDocument(user, doc);
  const sharePerm = canInitiateShare(user, doc);

  const isTampered =
    Boolean(doc.flags.tamper_detected) || doc.original_hash !== doc.computed_hash;

  const handleDownload = async () => {
    if (!user) return;
    const blob = await documentsService.downloadDocument(
      doc.file_id,
      user.user_id,
      user.full_name || user.username
    );
    const url = window.URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${doc.version}.txt`;
    window.document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    window.document.body.removeChild(a);
  };

  const handleToggleTamper = async () => {
    await documentsService.toggleTamperSimulation(doc.file_id);
    if (onRefresh) onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Header navigation and controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back
          </Button>
          <div>
            <h2 className="text-h2 font-semibold text-text-primary flex items-center gap-2">
              <span>{doc.title}</span>
            </h2>
            <div className="text-xs text-text-muted mt-0.5">
              Case ID: <span className="font-mono text-accent-primary">{doc.case_id}</span> • Node Archive: Patiala House
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <TamperBadge status={isTampered ? 'TAMPERED' : 'VERIFIED'} size="md" />
          <SensitivityBadge level={doc.sensitivity_level} size="md" showDetails />

          {/* Dev Tamper Toggle */}
          <Tooltip content="Developer: Toggle simulated hash corruption to inspect tamper handling">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToggleTamper}
              leftIcon={<Bug className="w-3.5 h-3.5" />}
              className="text-text-muted"
            >
              Simulate Tamper
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Visually unmissable banner if TAMPERED */}
      {isTampered && (
        <div className="p-4 rounded-card bg-accent-danger text-white flex items-center justify-between shadow-[0_0_20px_rgba(232,69,69,0.4)] animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">⚠️ CRITICAL ALERT:</span>
            <div>
              <div className="font-bold text-base">EVIDENTIARY TAMPER DETECTED</div>
              <div className="text-xs text-white/90">
                Decrypted raw bytes produce SHA-256 hash mismatch against the blockchain-anchored original. Document is inadmissible until forensic re-verification.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scoped time-limited expiry notice */}
      {doc.access_expiry && (
        <div className="flex items-center gap-2 p-3 rounded-card bg-accent-warning/10 border border-accent-warning/30 text-accent-warning text-xs">
          <Clock className="w-4 h-4 shrink-0 animate-pulse" />
          <span>
            Time-Limited Access Grant: Your authorization expires in {formatRelativeTime(doc.access_expiry)}. All views and downloads are registered to the immutable audit trail.
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('content')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'content'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Decrypted Evidence Content
          </button>
          <button
            onClick={() => setActiveTab('metadata')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'metadata'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Metadata & Provenance
          </button>
          <button
            onClick={() => setActiveTab('versions')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'versions'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Version Ledger (v{doc.version})
          </button>
        </div>

        {/* Top actions */}
        <div className="flex items-center gap-2 pb-2">
          <Tooltip content={!downloadPerm.allowed ? downloadPerm.reason : 'Download decrypted file'}>
            <Button
              size="sm"
              variant="secondary"
              disabled={!downloadPerm.allowed}
              onClick={handleDownload}
              leftIcon={!downloadPerm.allowed ? <Lock className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            >
              Download
            </Button>
          </Tooltip>

          <Tooltip content={!sharePerm.allowed ? sharePerm.reason : 'Controlled document sharing'}>
            <Button
              size="sm"
              variant="primary"
              disabled={!sharePerm.allowed}
              onClick={() => onShare(doc)}
              leftIcon={!sharePerm.allowed ? <Lock className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            >
              Share Document
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'content' && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <FileText className="w-4 h-4 text-accent-primary" />
              <span>Extracted Ingest Stream (AES-256-GCM Decrypted in Memory)</span>
            </div>
            <span className="text-[11px] font-mono text-text-muted">
              Chars: {doc.ocr_text?.length || 0}
            </span>
          </div>

          <div className="bg-bg-secondary p-4 rounded-card border border-border font-mono text-xs text-text-primary whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
            {doc.ocr_text || 'No text extracted.'}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-text-muted pt-2 border-t border-border">
            <span>DEK Envelope Decrypted</span>
            <span className="text-accent-success">GCM Authentication Tag Validated</span>
          </div>
        </Card>
      )}

      {activeTab === 'metadata' && <MetadataPanel document={doc} />}

      {activeTab === 'versions' && (
        <VersionHistory document={doc} onVersionAdded={onRefresh} />
      )}
    </div>
  );
};
