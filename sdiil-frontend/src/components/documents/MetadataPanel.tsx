import React from 'react';
import { DocumentRecord } from '@/types/document.types';
import { Card } from '@/components/ui/Card';
import { formatFileSize, formatDate } from '@/utils/formatDate';
import { FileText, Calendar, Building2, User, Hash, HardDrive, Sparkles } from 'lucide-react';

export interface MetadataPanelProps {
  document: DocumentRecord;
}

export const MetadataPanel: React.FC<MetadataPanelProps> = ({ document: doc }) => {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <h3 className="text-h3 font-semibold text-text-primary flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent-primary" />
          Document Metadata
        </h3>
        {doc.metadata.ai_extracted && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-primary bg-accent-primary/10 border border-accent-primary/30 px-2 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3" />
            AI Extracted
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="flex items-start gap-2.5 p-2.5 rounded-input bg-bg-elevated/40 border border-border/50">
          <Hash className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-text-muted uppercase font-mono tracking-wider">Case Reference</div>
            <div className="text-text-primary font-medium truncate">
              {doc.metadata.case_id_reference || doc.case_id}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2.5 rounded-input bg-bg-elevated/40 border border-border/50">
          <Calendar className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-text-muted uppercase font-mono tracking-wider">Document Date</div>
            <div className="text-text-primary font-medium">{doc.metadata.document_date || '—'}</div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2.5 rounded-input bg-bg-elevated/40 border border-border/50">
          <Building2 className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-text-muted uppercase font-mono tracking-wider">Issuing Dept</div>
            <div className="text-text-primary font-medium truncate">
              {doc.metadata.issuing_department || 'ICJS Node'}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2.5 rounded-input bg-bg-elevated/40 border border-border/50">
          <User className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-text-muted uppercase font-mono tracking-wider">Author / Signatory</div>
            <div className="text-text-primary font-medium truncate">
              {doc.metadata.author_name || doc.uploader_name || 'Authorized Officer'}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2.5 rounded-input bg-bg-elevated/40 border border-border/50">
          <HardDrive className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-text-muted uppercase font-mono tracking-wider">Payload Size</div>
            <div className="text-text-primary font-medium">
              {formatFileSize(doc.metadata.file_size_bytes)} ({doc.metadata.mime_type || 'PDF'})
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2.5 rounded-input bg-bg-elevated/40 border border-border/50">
          <Calendar className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-text-muted uppercase font-mono tracking-wider">Ingest Timestamp</div>
            <div className="text-text-primary font-medium truncate">{formatDate(doc.created_at)}</div>
          </div>
        </div>
      </div>

      {/* Identified Entities */}
      {doc.metadata.mentioned_entities && doc.metadata.mentioned_entities.length > 0 && (
        <div className="pt-2">
          <span className="text-label text-text-muted block mb-1.5">Mentioned Entities (NLP Tagged)</span>
          <div className="flex flex-wrap gap-1.5">
            {doc.metadata.mentioned_entities.map((ent, idx) => (
              <span
                key={idx}
                className="text-[11px] px-2 py-0.5 rounded bg-bg-secondary text-text-secondary border border-border"
              >
                {ent}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Cryptographic Footprint */}
      <div className="pt-2 border-t border-border space-y-1.5">
        <div>
          <span className="text-[10px] font-mono text-text-muted uppercase">MinIO Blob Storage Path</span>
          <div className="font-mono text-[11px] text-text-secondary bg-bg-primary p-1.5 rounded border border-border truncate select-all">
            {doc.minio_path}
          </div>
        </div>
        <div>
          <span className="text-[10px] font-mono text-text-muted uppercase">Digital RSA Signature</span>
          <div className="font-mono text-[11px] text-text-secondary bg-bg-primary p-1.5 rounded border border-border truncate select-all">
            {doc.system_signature}
          </div>
        </div>
      </div>
    </Card>
  );
};
