import React, { useState, useEffect } from 'react';
import { db } from '@/services/api';
import { CaseRecord, CaseSummaryResponse, StructuredCaseSummary } from '@/types/case.types';
import { DocumentRecord, DocType, SensitivityLevel, RAGSearchCitation } from '@/types/document.types';
import { useAuth } from '@/hooks/useAuth';
import { useDocuments } from '@/hooks/useDocuments';
import { searchService } from '@/services/search.service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { ShareModal } from '@/components/sharing/ShareModal';
import { CitationChip } from '@/components/search/CitationChip';
import {
  Sparkles,
  Bot,
  UploadCloud,
  ArrowLeft,
  Search,
  FolderOpen,
  FileText,
  AlertTriangle,
  Users,
  Layers,
  Activity,
  ShieldAlert,
  Clock,
  ShieldCheck,
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
  const [activeTab, setActiveTab] = useState<'evidence' | 'summary'>('evidence');
  const [caseSummary, setCaseSummary] = useState<CaseSummaryResponse | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [sharingDoc, setSharingDoc] = useState<DocumentRecord | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');

  useEffect(() => {
    const c = db.cases.find((item) => item.case_id === caseId);
    if (c) setCurrentCase(c);
  }, [caseId]);

  const handleGenerateSummary = async () => {
    if (!user) return;
    setIsSummaryLoading(true);
    setSummaryError(null);
    try {
      const summary = await searchService.getCaseSummary(
        caseId,
        user.role,
        user.user_id,
        user.full_name || user.username
      );
      setCaseSummary(summary);
    } catch (err: unknown) {
      console.error('Failed to generate AI summary:', err);
      setSummaryError(err instanceof Error ? err.message : 'Failed to generate AI summary');
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

  const isRestrictedRole = user?.role === 'COURT_REGISTRAR' || (user?.role as string) === 'JUDGE';

  const sectionConfigs: Array<{
    key: keyof StructuredCaseSummary;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: 'case_overview', label: 'Case Overview', icon: FileText },
    { key: 'key_incidents', label: 'Key Incidents', icon: AlertTriangle },
    { key: 'persons_of_interest', label: 'Persons of Interest', icon: Users },
    { key: 'evidence_summary', label: 'Evidence Summary', icon: Layers },
    { key: 'investigation_status', label: 'Investigation Status', icon: Activity },
  ];

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

      {/* Tabs Navigation */}
      <div className="flex items-center gap-3 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('evidence')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer ${
            activeTab === 'evidence'
              ? 'border-accent-primary text-accent-primary font-semibold'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          <span>Evidence &amp; Exhibits</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-bg-elevated border border-border text-text-secondary">
            {documents.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer ${
            activeTab === 'summary'
              ? 'border-accent-primary text-accent-primary font-semibold'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>AI Case Summary</span>
          {caseSummary && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-success/15 text-accent-success border border-accent-success/30 font-semibold">
              Synthesized
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: EVIDENCE & EXHIBITS */}
      {activeTab === 'evidence' && (
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
      )}

      {/* TAB 2: AI CASE SUMMARY */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Action Header Card */}
          <Card className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-accent-primary/30 bg-bg-card">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-card bg-accent-primary/10 border border-accent-primary/20 text-accent-primary shrink-0">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-h3 font-semibold text-text-primary flex items-center gap-2">
                  AI-Powered Case Intelligence Summary
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
                    ABAC Clearance Filtered
                  </span>
                </h3>
                <p className="text-xs text-text-muted mt-1 max-w-2xl">
                  Synthesize an executive intelligence summary across all authorized case documents using Google Gemini LLM. Chunks above your sensitivity clearance are strictly filtered at the database retrieval layer before synthesis.
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="md"
              isLoading={isSummaryLoading}
              onClick={handleGenerateSummary}
              leftIcon={<Sparkles className="w-4 h-4" />}
              className="shrink-0"
            >
              {caseSummary ? 'Re-generate Case Summary' : 'Generate Case Summary'}
            </Button>
          </Card>

          {/* Error display */}
          {summaryError && (
            <Alert variant="danger" title="Generation Failed">
              {summaryError}
            </Alert>
          )}

          {/* Loading State */}
          {isSummaryLoading && (
            <Card className="py-16 text-center space-y-4 border-accent-primary/30 bg-bg-card">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-12 h-12 border-4 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" />
                  <Bot className="w-5 h-5 text-accent-primary absolute inset-0 m-auto" />
                </div>
              </div>
              <div className="space-y-1">
                <h4 className="text-body font-semibold text-accent-primary animate-pulse">
                  Analyzing authorized documents...
                </h4>
                <p className="text-xs text-text-muted max-w-md mx-auto">
                  Retrieving authorized document embeddings, grouping by doc type, and synthesizing 5-section case intelligence via Gemini LLM.
                </p>
              </div>
            </Card>
          )}

          {/* Summary Content */}
          {!isSummaryLoading && caseSummary && (
            <div className="space-y-6">
              {/* Mandatory ICJS Human Verification Warning Banner */}
              <Alert variant="ai-verification" title="Human Verification Required (ICJS Rule)">
                This summary was generated by an AI assistant and must be verified by an investigator before being used in legal proceedings.
              </Alert>

              {/* Summary Metadata Badge Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-card bg-bg-elevated border border-border text-xs">
                <div className="flex items-center gap-4 text-text-muted">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-accent-primary" />
                    <strong>{caseSummary.chunks_used}</strong> chunks analyzed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-accent-primary" />
                    <strong>{caseSummary.cited_doc_ids.length}</strong> documents cited
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-accent-success" />
                    ABAC Clearance Verified
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-text-muted font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Generated: {new Date(caseSummary.generated_at).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* 5 Structured Section Cards */}
              <div className="space-y-4">
                {sectionConfigs.map(({ key, label, icon: Icon }) => {
                  const sectionData = caseSummary.summary?.[key];
                  if (!sectionData) return null;

                  // Map cited document IDs to full citations
                  const sectionCitations: RAGSearchCitation[] = (sectionData.cited_doc_ids || []).map((id) => {
                    const existing = caseSummary.citations?.find((c) => c.doc_id === id);
                    if (existing) {
                      return {
                        chunk_id: existing.chunk_id || id,
                        doc_id: existing.doc_id,
                        doc_title: existing.doc_title,
                        doc_type: (existing.doc_type || 'CASE_FILE') as DocType,
                        sensitivity_level: existing.sensitivity_level,
                        chunk_text: existing.chunk_text || '',
                        similarity_score: existing.similarity_score || 1.0,
                      };
                    }
                    const doc = documents.find((d) => d.file_id === id);
                    return {
                      chunk_id: id,
                      doc_id: id,
                      doc_title: doc?.title || doc?.doc_type || id,
                      doc_type: (doc?.doc_type || 'CASE_FILE') as DocType,
                      sensitivity_level: (doc?.sensitivity_level || 'C') as SensitivityLevel,
                      chunk_text: '',
                      similarity_score: 1.0,
                    };
                  });

                  // Check if this section is restricted for JUDGE / COURT_REGISTRAR
                  const isRestricted =
                    isRestrictedRole &&
                    (sectionCitations.length === 0 ||
                      sectionData.content.toLowerCase().includes('restricted') ||
                      sectionData.content.toLowerCase().includes('insufficient clearance'));

                  if (isRestricted) {
                    return (
                      <Card key={key} className="space-y-3 border-border bg-bg-card">
                        <div className="flex items-center gap-2 pb-2 border-b border-border">
                          <Icon className="w-4 h-4 text-accent-warning" />
                          <h4 className="text-h3 font-semibold text-text-primary">{label}</h4>
                        </div>
                        <div className="p-3 rounded-card bg-bg-elevated border border-accent-warning/20 text-accent-warning text-xs flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 shrink-0" />
                          <span>Restricted — insufficient clearance to view this section</span>
                        </div>
                      </Card>
                    );
                  }

                  return (
                    <Card
                      key={key}
                      className="space-y-3 border-border bg-bg-card hover:border-accent-primary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-border">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-accent-primary" />
                          <h4 className="text-h3 font-semibold text-text-primary">
                            {sectionData.title || label}
                          </h4>
                        </div>
                        {sectionCitations.length > 0 && (
                          <span className="text-[11px] text-text-muted font-mono">
                            {sectionCitations.length} citation{sectionCitations.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      <div className="text-body text-text-secondary leading-relaxed whitespace-pre-line text-sm">
                        {sectionData.content}
                      </div>

                      {sectionCitations.length > 0 && (
                        <div className="pt-3 border-t border-border/60">
                          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-2">
                            Source Document Citations:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {sectionCitations.map((cit, idx) => (
                              <CitationChip
                                key={`${cit.doc_id}-${idx}`}
                                citation={cit}
                                onClick={(docId) => {
                                  const targetDoc = documents.find((d) => d.file_id === docId);
                                  if (targetDoc) {
                                    onSelectDoc(targetDoc);
                                  }
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State when no summary generated yet */}
          {!isSummaryLoading && !caseSummary && (
            <Card className="py-12 text-center space-y-3 border-border bg-bg-card">
              <div className="p-3 rounded-full bg-accent-primary/10 text-accent-primary w-fit mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="text-h3 font-semibold text-text-primary">No Case Summary Generated Yet</h4>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                Click "Generate Case Summary" above to synthesize an intelligence report across all authorized documents in this case. Only documents matching your security clearance will be included.
              </p>
              <div className="pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleGenerateSummary}
                  leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                >
                  Generate Case Summary
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

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

