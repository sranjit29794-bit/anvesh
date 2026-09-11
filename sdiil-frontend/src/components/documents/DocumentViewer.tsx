import React, { useEffect, useState, useCallback } from 'react';
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
import {
  Download,
  Share2,
  Clock,
  Lock,
  FileText,
  ArrowLeft,
  Bug,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Loader2,
} from 'lucide-react';


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
  const [activeTab, setActiveTab] = useState<'content' | 'text' | 'metadata' | 'versions'>('content');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  // Document rendering state
  const [docViewUrl, setDocViewUrl] = useState<string | null>(null);
  const [docViewError, setDocViewError] = useState<string | null>(null);
  const [isDocLoading, setIsDocLoading] = useState(false);
  const [textOnlyContent, setTextOnlyContent] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      documentsService.acknowledgeFirstOpen(doc.file_id, user.user_id, user.full_name || user.username);
    }
  }, [doc.file_id, user]);

  const downloadPerm = canDownloadDocument(user, doc);
  const sharePerm = canInitiateShare(user, doc);

  const isTampered =
    Boolean(doc.flags.tamper_detected) || doc.original_hash !== doc.computed_hash;

  const [isDownloading, setIsDownloading] = useState(false);

  const isSupervisorOrAdmin = user?.role === 'SUPERVISOR' || user?.role === 'ADMIN';

  const isPdf = doc.mime_type === 'application/pdf' || doc.mime_type === 'application/octet-stream';
  const isImage = doc.mime_type?.startsWith('image/') || false;
  const isText = doc.mime_type === 'text/plain';

  // Fetch signed URL for document viewing
  const loadDocumentView = useCallback(async () => {
    setIsDocLoading(true);
    setDocViewError(null);
    setDocViewUrl(null);
    setTextOnlyContent(null);

    try {
      const viewResult = await documentsService.viewDocument(doc.file_id);
      if (viewResult.type === 'text_only' || !viewResult.url) {
        setTextOnlyContent(viewResult.content || doc.ocr_text || 'No text extracted.');
      } else {
        setDocViewUrl(viewResult.url);
      }
    } catch (err: any) {
      if (doc.ocr_text) {
        setTextOnlyContent(doc.ocr_text);
      } else {
        setDocViewError(err?.message || 'Failed to load document for viewing.');
      }
    } finally {
      setIsDocLoading(false);
    }
  }, [doc.file_id, doc.ocr_text]);

  useEffect(() => {
    loadDocumentView();
  }, [loadDocumentView]);

  const handleApprove = async () => {
    try {
      setIsApproving(true);
      await documentsService.approveDocument(doc.file_id);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err?.message || 'Failed to approve document');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (rejectionReason.trim().length < 10) {
      setRejectionError('Rejection reason must be at least 10 characters.');
      return;
    }
    try {
      setIsRejecting(true);
      await documentsService.rejectDocument(doc.file_id, rejectionReason.trim());
      setRejectModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setRejectionError(err?.message || 'Failed to reject document');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleDownload = async () => {
    if (!user) return;
    try {
      setIsDownloading(true);
      const { filename, blob } = await documentsService.downloadDocument(
        doc.file_id,
        user.user_id,
        user.full_name || user.username
      );
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = filename || `${doc.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${doc.version}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
    } catch (err: any) {
      alert(err?.message || 'Failed to download document');
    } finally {
      setIsDownloading(false);
    }
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
          {/* Active / Verified Badge */}
          {doc.status === 'ACTIVE' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-btn bg-accent-success/15 border border-accent-success/30 text-accent-success text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified</span>
              {doc.reviewed_by_name && <span className="opacity-90">• by {doc.reviewed_by_name}</span>}
              {doc.reviewed_at && <span className="opacity-75">• {new Date(doc.reviewed_at).toLocaleDateString()}</span>}
            </div>
          )}

          <TamperBadge
            status={isTampered ? 'TAMPERED' : 'VERIFIED'}
            hash={doc.original_hash || doc.computed_hash}
            size="md"
          />
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

      {/* Attestation Status Banner: PENDING_REVIEW */}
      {doc.status === 'PENDING_REVIEW' && (
        <div
          style={{ backgroundColor: '#1A1208', borderLeft: '4px solid #F5A623' }}
          className="p-4 rounded-r-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-[#F5A623]"
        >
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 shrink-0 text-[#F5A623]" />
            <div>
              <span className="font-semibold">Review Required: </span>
              <span>This document is awaiting supervisor review. It is not visible to other users until approved.</span>
            </div>
          </div>
          {isSupervisorOrAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="primary"
                className="bg-accent-success hover:bg-accent-success/90 text-white border-0"
                isLoading={isApproving}
                onClick={handleApprove}
                leftIcon={<CheckCircle className="w-4 h-4" />}
              >
                Approve Document
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="bg-accent-danger/20 hover:bg-accent-danger/30 text-accent-danger border border-accent-danger/40"
                onClick={() => {
                  setRejectionReason('');
                  setRejectionError(null);
                  setRejectModalOpen(true);
                }}
                leftIcon={<XCircle className="w-4 h-4" />}
              >
                Reject Document
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Attestation Status Banner: REJECTED */}
      {doc.status === 'REJECTED' && (
        <div
          style={{ backgroundColor: '#1A0808', borderLeft: '4px solid #E84545' }}
          className="p-4 rounded-r-card flex items-center gap-3 text-sm text-[#E84545]"
        >
          <XCircle className="w-5 h-5 shrink-0 text-[#E84545]" />
          <div>
            <span className="font-semibold">Document rejected: </span>
            <span>{doc.review_note || 'No reason specified'}</span>
            {doc.reviewed_at && (
              <span className="text-xs opacity-75 ml-2">({new Date(doc.reviewed_at).toLocaleString()})</span>
            )}
          </div>
        </div>
      )}

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
            Document View
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'text'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Text View
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
          <Tooltip content={!downloadPerm.allowed ? downloadPerm.reason : 'Download document'}>
            <Button
              size="sm"
              variant="secondary"
              disabled={!downloadPerm.allowed}
              isLoading={isDownloading}
              onClick={handleDownload}
              leftIcon={!downloadPerm.allowed ? <Lock className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            >
              Download Evidence
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
              <span>
                {isPdf ? 'PDF Document' : isImage ? 'Image Document' : isText ? 'Text Document' : 'Document Viewer'} —{' '}
                <span className="font-mono text-accent-primary">{doc.mime_type || 'unknown'}</span>
              </span>
            </div>
          </div>

          {/* Loading state while fetching URL */}
          {isDocLoading && (
            <div
              style={{
                height: '600px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#111118',
                borderRadius: '8px',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <Loader2 className="w-8 h-8 animate-spin text-accent-primary mx-auto" />
                <p style={{ color: '#9090A8', marginTop: '12px', fontSize: '13px' }}>
                  Loading document...
                </p>
              </div>
            </div>
          )}

          {/* Error state if fetch fails */}
          {docViewError && !isDocLoading && (
            <div
              style={{
                height: '600px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#111118',
                borderRadius: '8px',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <XCircle size={32} color="#E84545" className="mx-auto" />
                <p style={{ color: '#E84545', marginTop: '8px', fontSize: '13px' }}>
                  {docViewError || 'Could not load document'}
                </p>
                <button
                  onClick={loadDocumentView}
                  style={{
                    marginTop: '12px',
                    padding: '6px 14px',
                    background: '#1f1f2e',
                    border: '1px solid #3a3a4d',
                    borderRadius: '6px',
                    color: '#F0F0F5',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Option C: Native PDF rendering via iframe */}
          {!isDocLoading && !docViewError && docViewUrl && isPdf && (
            <iframe
              src={docViewUrl}
              style={{
                width: '100%',
                height: '600px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: '#111118',
              }}
              title="Document Viewer"
            />
          )}

          {/* Image files rendering */}
          {!isDocLoading && !docViewError && docViewUrl && isImage && (
            <img
              src={docViewUrl}
              alt={doc.title}
              style={{
                width: '100%',
                maxHeight: '600px',
                objectFit: 'contain',
                borderRadius: '8px',
              }}
            />
          )}

          {/* Text-only fallback */}
          {!isDocLoading && !docViewError && (textOnlyContent || (!docViewUrl && isText)) && (
            <div
              style={{
                background: '#111118',
                padding: '16px',
                borderRadius: '8px',
                height: '600px',
                overflow: 'auto',
              }}
            >
              <div
                style={{
                  background: '#1A1208',
                  borderLeft: '4px solid #F5A623',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '12px',
                  color: '#F5A623',
                }}
              >
                Original file not in vault. Displaying extracted text only.
              </div>
              <pre
                style={{
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  color: '#F0F0F5',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {textOnlyContent || doc.ocr_text || 'No extracted text available.'}
              </pre>
            </div>
          )}

          {/* Fallback when no viewer is available */}
          {!isDocLoading && !docViewError && !docViewUrl && !textOnlyContent && !isText && (
            <div className="py-12 text-center text-text-muted">
              Document preview not available for this file type.
            </div>
          )}
        </Card>
      )}

      {activeTab === 'text' && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <FileText className="w-4 h-4 text-accent-primary" />
              <span>AI-Extracted Text (OCR)</span>
            </div>
            <span className="text-[11px] font-mono text-text-muted">
              {doc.ocr_text?.length || 0} characters
            </span>
          </div>

          <div className="bg-bg-secondary p-4 rounded-card border border-border font-mono text-xs text-text-primary whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
            {doc.ocr_text || 'No text extracted.'}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-text-muted pt-2 border-t border-border">
            <span>Note: This is AI-extracted OCR text, not the original document.</span>
            <span>SHA-256: {doc.original_hash?.slice(0, 16)}...{doc.original_hash?.slice(-8)}</span>
          </div>
        </Card>
      )}

      {activeTab === 'metadata' && <MetadataPanel document={doc} />}

      {activeTab === 'versions' && (
        <VersionHistory document={doc} onVersionAdded={onRefresh} />
      )}

      {/* Reject Modal Dialog */}
      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-bg-card border border-border rounded-modal max-w-lg w-full p-6 space-y-4 shadow-modal animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-h3 font-semibold text-text-primary flex items-center gap-2 text-accent-danger">
                <XCircle className="w-5 h-5" />
                Reject Document
              </h3>
              <button
                onClick={() => setRejectModalOpen(false)}
                className="text-text-muted hover:text-text-primary text-sm font-bold p-1 rounded"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-text-secondary">
              Please specify a detailed reason for rejecting this document. This reason will be permanently recorded in the immutable audit trail and displayed to the uploader.
            </p>

            <div className="space-y-1.5">
              <label className="text-label text-text-secondary block">
                Rejection Reason (Required, min 10 characters):
              </label>
              <textarea
                rows={4}
                value={rejectionReason}
                onChange={(e) => {
                  setRejectionReason(e.target.value);
                  if (rejectionError) setRejectionError(null);
                }}
                placeholder="e.g. Illegible scan, pages 3-4 missing, or unverified official seal..."
                className="w-full bg-bg-elevated border border-border rounded-input p-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-danger focus:outline-none resize-none font-mono"
              />
              <div className="flex justify-between text-[11px] text-text-muted">
                <span>{rejectionReason.trim().length} / 10 characters minimum</span>
                {rejectionReason.trim().length < 10 && (
                  <span className="text-accent-warning">Requires at least 10 characters</span>
                )}
              </div>
            </div>

            {rejectionError && (
              <div className="p-2.5 bg-accent-danger/10 border border-accent-danger/30 rounded text-xs text-accent-danger">
                {rejectionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRejectModalOpen(false)}
                disabled={isRejecting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-accent-danger hover:bg-accent-danger/90 text-white border-0"
                isLoading={isRejecting}
                disabled={rejectionReason.trim().length < 10}
                onClick={handleReject}
                leftIcon={<XCircle className="w-4 h-4" />}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
