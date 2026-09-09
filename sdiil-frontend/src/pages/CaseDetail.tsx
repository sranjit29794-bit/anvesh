import React, { useState, useEffect } from 'react';
import { db } from '@/services/api';
import { CaseRecord, CaseSummaryResponse } from '@/types/case.types';
import { DocumentRecord } from '@/types/document.types';
import { useAuth } from '@/hooks/useAuth';
import { useDocuments } from '@/hooks/useDocuments';
import { searchService } from '@/services/search.service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { ShareModal } from '@/components/sharing/ShareModal';
import {
  Sparkles,
  Bot,
  UploadCloud,
  ArrowLeft,
  Search,
} from 'lucide-react';

export interface CaseDetailProps {
  caseId: string;
  onBack: () => void;
  onSelectDoc: (doc: DocumentRecord) => void;
  navigate: (route: string) => void;
}

export const CaseDetail: React.FC<CaseDetailProps> = ({
  caseId,
  onBack,
  onSelectDoc,
  navigate,
}) => {
  const { user } = useAuth();
  const { documents, isLoading, downloadDocument, toggleTamper, checkUploadPermission } =
    useDocuments(caseId);

  const [currentCase, setCurrentCase] = useState<CaseRecord | null>(null);
  const [caseSummary, setCaseSummary] = useState<CaseSummaryResponse | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [sharingDoc, setSharingDoc] = useState<DocumentRecord | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');

  useEffect(() => {
    const c = db.cases.find((item) => item.case_id === caseId);
    if (c) setCurrentCase(c);
  }, [caseId]);

  const handleGenerateSummary = async () => {
    if (!user) return;
    setIsSummaryLoading(true);
    try {
      const summary = await searchService.getCaseSummary(
        caseId,
        user.role,
        user.user_id,
        user.full_name || user.username
      );
      setCaseSummary(summary);
    } catch {
      alert('Failed to generate AI summary');
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const uploadPerm = checkUploadPermission();

  const filteredDocs =
    filterType === 'ALL'
      ? documents
      : documents.filter((d) => d.sensitivity_level === filterType || d.doc_type === filterType);

  if (!currentCase) {
    return (
      <div className="p-8 text-center text-text-muted">
        Case not found or unassigned in token claims.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="w-4 h-4" />}>
            All Folders
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-h2 font-bold text-text-primary">{currentCase.title}</h1>
              <span className="font-mono text-xs font-semibold text-accent-primary bg-accent-primary/10 border border-accent-primary/20 px-2 py-0.5 rounded">
                {currentCase.case_number}
              </span>
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              Investigating Officer: <strong>{currentCase.investigating_officer}</strong> • Dept:{' '}
              {currentCase.department}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/search')}
            leftIcon={<Search className="w-4 h-4" />}
          >
            RAG Query
          </Button>

          {uploadPerm.allowed && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/upload')}
              leftIcon={<UploadCloud className="w-4 h-4" />}
            >
              Ingest Evidence
            </Button>
          )}
        </div>
      </div>

      {/* Workflow: Case Summary Panel (AI Generated over authorized documents) */}
      <Card className="space-y-4 border-accent-primary/30 bg-bg-card">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-accent-primary" />
            <h3 className="text-h3 font-semibold text-text-primary">
              AI-Generated Case Intelligence Briefing
            </h3>
          </div>

          <Button
            size="sm"
            variant={caseSummary ? 'secondary' : 'primary'}
            isLoading={isSummaryLoading}
            onClick={handleGenerateSummary}
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
          >
            {caseSummary ? 'Re-synthesize Briefing' : 'Synthesize Case Briefing'}
          </Button>
        </div>

        {caseSummary ? (
          <div className="space-y-4">
            {/* Mandatory human verification banner */}
            <Alert variant="ai-verification" title="Human Verification Required (ICJS Rule)">
              This AI-generated executive briefing was synthesized from {caseSummary.cited_doc_ids.length}{' '}
              authorized document(s) matching your clearance. It requires human verification before any
              legal determination or filing.
            </Alert>

            <div className="p-4 rounded-card bg-bg-secondary text-body text-text-primary leading-relaxed whitespace-pre-line border border-border">
              {caseSummary.executive_summary}
            </div>

            {/* Key Findings */}
            <div>
              <span className="text-label text-text-muted block mb-2">Corroborated Case Findings:</span>
              <ul className="space-y-1.5 pl-2 text-xs text-text-secondary list-disc list-inside">
                {caseSummary.key_findings.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>

            {/* Timeline highlights */}
            <div>
              <span className="text-label text-text-muted block mb-2">Chronological Evidentiary Milestones:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {caseSummary.timeline_highlights.map((t, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-input bg-bg-elevated border border-border flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono text-[10px] text-text-muted block">{t.date}</span>
                      <span className="font-semibold text-text-primary">{t.event}</span>
                    </div>
                    <SensitivityBadge level={t.sensitivity_level} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center space-y-2">
            <p className="text-xs text-text-muted max-w-md mx-auto">
              Synthesize a structured intelligence summary over all authorized documents in this case.
              Higher sensitivity items are filtered at retrieval time based on your active clearance.
            </p>
          </div>
        )}
      </Card>

      {/* Documents Filter & Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-h2 font-semibold text-text-primary">Case Evidences & Exhibits</h3>
            <p className="text-xs text-text-secondary">
              Showing {filteredDocs.length} evidence file(s) registered under {currentCase.case_number}.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-label text-text-muted">Filter:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-bg-elevated text-text-primary text-xs border border-border rounded-input py-1.5 px-2.5 outline-none focus:border-accent-primary cursor-pointer"
            >
              <option value="ALL">All Levels & Types</option>
              <option value="A">Sensitivity A (Dual-Auth)</option>
              <option value="B">Sensitivity B</option>
              <option value="C">Sensitivity C</option>
              <option value="FIR">FIRs</option>
              <option value="WITNESS_STATEMENT">Witness Statements</option>
              <option value="FORENSIC_REPORT">Forensic Reports</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-text-muted">Loading vault records...</div>
        ) : filteredDocs.length === 0 ? (
          <Card className="py-12 text-center text-xs text-text-muted">
            No documents matching the selected filter criteria.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocs.map((doc) => (
              <DocumentCard
                key={doc.file_id}
                document={doc}
                onView={onSelectDoc}
                onDownload={downloadDocument}
                onShare={(d) => setSharingDoc(d)}
                onToggleTamper={toggleTamper}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sharing modal */}
      {sharingDoc && (
        <ShareModal
          isOpen={Boolean(sharingDoc)}
          onClose={() => setSharingDoc(null)}
          document={sharingDoc}
        />
      )}
    </div>
  );
};
