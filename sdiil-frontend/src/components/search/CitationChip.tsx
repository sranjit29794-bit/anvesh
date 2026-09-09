import React from 'react';
import { RAGSearchCitation } from '@/types/document.types';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { FileText, ExternalLink } from 'lucide-react';

export interface CitationChipProps {
  citation: RAGSearchCitation;
  onClick?: (docId: string) => void;
}

export const CitationChip: React.FC<CitationChipProps> = ({ citation, onClick }) => {
  return (
    <button
      type="button"
      onClick={() => onClick && onClick(citation.doc_id)}
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-btn bg-bg-elevated hover:bg-bg-card border border-border hover:border-accent-primary text-left transition-all duration-150 group"
      title={citation.doc_title}
    >
      <FileText className="w-3.5 h-3.5 text-accent-primary group-hover:scale-105 transition-transform shrink-0" />
      <div className="flex flex-col min-w-0 max-w-[180px]">
        <span className="text-xs font-semibold text-text-primary truncate">
          {citation.doc_title}
        </span>
        <span className="text-[10px] font-mono text-text-muted truncate">
          {citation.doc_id} • {(citation.similarity_score * 100).toFixed(0)}% sim
        </span>
      </div>
      <SensitivityBadge level={citation.sensitivity_level} size="sm" />
      <ExternalLink className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 shrink-0" />
    </button>
  );
};
