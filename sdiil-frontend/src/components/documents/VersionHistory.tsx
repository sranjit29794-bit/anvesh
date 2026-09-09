import React, { useState, useEffect, useCallback } from 'react';
import { DocumentRecord, DocumentVersion } from '@/types/document.types';
import { documentsService } from '@/services/documents.service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatDate } from '@/utils/formatDate';
import { GitCommit, History, Plus, HardDrive, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export interface VersionHistoryProps {
  document: DocumentRecord;
  onVersionAdded?: () => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({ document: doc, onVersionAdded }) => {
  const { user } = useAuth();
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    const data = await documentsService.getDocumentVersions(doc.file_id);
    setVersions(data);
    setIsLoading(false);
  }, [doc.file_id]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;
    setIsSubmitting(true);
    try {
      await documentsService.uploadNewVersion(
        doc.file_id,
        file,
        user.user_id,
        user.full_name || user.username,
        summary || 'Addendum / version update'
      );
      setFile(null);
      setSummary('');
      setShowUploadForm(false);
      await loadVersions();
      if (onVersionAdded) onVersionAdded();
    } catch {
      alert('Failed to register new version');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canUploadVersion =
    user?.role === 'INVESTIGATOR' ||
    user?.role === 'SUPERVISOR' ||
    user?.role === 'ADMIN' ||
    (user?.role === 'FORENSIC_OFFICER' && doc.doc_type === 'FORENSIC_REPORT');

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-accent-primary" />
          <h3 className="text-h3 font-semibold text-text-primary">Version Provenance History</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-bg-elevated text-text-muted border border-border">
            v{doc.version} Active
          </span>
        </div>

        {canUploadVersion && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowUploadForm(!showUploadForm)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            {showUploadForm ? 'Cancel' : 'Upload Addendum / Version'}
          </Button>
        )}
      </div>

      {showUploadForm && (
        <form
          onSubmit={handleNewVersion}
          className="p-4 rounded-card bg-bg-secondary border border-border-strong space-y-3"
        >
          <div className="text-xs font-semibold text-text-primary">
            Register New Revision (Preserves v{doc.version} immutably in storage)
          </div>
          <Input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
            helperText="Raw file will receive new SHA-256 and register VERSION_CREATED event"
          />
          <Input
            label="Revision / Addendum Reason"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Supplementary statement annexed or corrections made"
            required
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowUploadForm(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              Commit Revision
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-xs text-text-muted py-4 text-center">Loading version ledger...</div>
      ) : (
        <div className="space-y-3">
          {versions.map((v) => {
            const isCurrent = v.version_number === doc.version;

            return (
              <div
                key={v.version_id}
                className={`p-3 rounded-card border transition-all ${
                  isCurrent
                    ? 'bg-bg-elevated/70 border-accent-primary/50 ring-1 ring-accent-primary/20'
                    : 'bg-bg-elevated/30 border-border opacity-85'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <GitCommit className="w-3.5 h-3.5 text-accent-primary" />
                    <span className="font-semibold text-xs text-text-primary">
                      Version {v.version_number}
                    </span>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-accent-success font-medium bg-accent-success/15 px-2 py-0.2 rounded">
                        <CheckCircle2 className="w-3 h-3" />
                        Current Head
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-text-muted">{formatDate(v.created_at)}</span>
                </div>

                <p className="text-xs text-text-secondary mb-2">
                  {v.change_summary || 'Evidence archive update'}
                </p>

                <div className="flex flex-col gap-1 text-[10px] font-mono text-text-muted bg-bg-primary/80 p-2 rounded border border-border">
                  <div className="flex items-center justify-between">
                    <span>SHA-256:</span>
                    <span className="text-text-secondary truncate max-w-[280px] sm:max-w-md select-all">
                      {v.hash}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3 h-3" /> MinIO Path:
                    </span>
                    <span className="text-text-secondary truncate max-w-[280px] sm:max-w-md select-all">
                      {v.minio_path}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Registered By:</span>
                    <span className="text-text-secondary">{v.created_by_name || v.created_by}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
