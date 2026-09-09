import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSearch } from '@/hooks/useSearch';
import { db } from '@/services/api';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchResult } from '@/components/search/SearchResult';
import { Card } from '@/components/ui/Card';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { Bot, FolderLock, Sparkles, Shield, AlertCircle } from 'lucide-react';

export interface SearchPageProps {
  navigate: (route: string) => void;
  onSelectDoc: (docId: string) => void;
}

export const Search: React.FC<SearchPageProps> = ({ onSelectDoc }) => {
  const { user, caseAssignments } = useAuth();
  const [cases, setCases] = useState<Array<{ id: string; case_number: string; title: string }>>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');

  useEffect(() => {
    if (caseAssignments && caseAssignments.length > 0) {
      const list = [
        { id: '', case_number: 'All Assigned Cases (Cross-Case Scope)', title: 'All Assigned Cases' },
        ...caseAssignments.map((a) => ({
          id: a.cases?.id || a.case_id,
          case_number: a.cases?.case_number || a.case_id,
          title: a.cases?.title || 'Assigned Case',
        })),
      ];
      setCases(list);
    } else {
      const assigned = [
        { id: '', case_number: 'All Assigned Cases (Cross-Case Scope)', title: 'All Assigned Cases' },
        ...db.cases
          .filter((c) => user?.role === 'ADMIN' || (user?.case_ids && user.case_ids.includes(c.case_id)))
          .map((c) => ({ id: c.case_id, case_number: c.case_number, title: c.title })),
      ];
      setCases(assigned);
    }
  }, [user, caseAssignments]);

  const { query, setQuery, result, isLoading, error, executeSearch } = useSearch(selectedCaseId);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-h1 font-bold text-text-primary flex items-center gap-2.5">
            <Bot className="w-6 h-6 text-accent-primary" />
            ABAC-Gated Case Intelligence
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Semantic pgvector query strictly filtered by role clearance and case assignments.
          </p>
        </div>

        {/* Case Selector */}
        <div className="flex items-center gap-2 bg-bg-card border border-border px-3 py-1.5 rounded-btn text-xs">
          <FolderLock className="w-4 h-4 text-accent-primary shrink-0" />
          <span className="text-text-muted font-mono uppercase">Scope:</span>
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="bg-transparent text-text-primary text-xs font-semibold outline-none cursor-pointer"
          >
            {cases.map((c) => (
              <option key={c.id || 'all'} value={c.id} className="bg-bg-card">
                {c.case_number}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Clearance Guard Info Banner */}
      <div className="flex items-center justify-between p-3 rounded-card bg-bg-secondary border border-border text-xs">
        <div className="flex items-center gap-2 text-text-secondary">
          <Shield className="w-4 h-4 text-accent-primary" />
          <span>
            Retrieval-Layer ABAC Active: You are cleared for documents up to{' '}
            <strong>Level {user?.sensitivity_clearance}</strong>. Unauthorized chunks are excluded at
            the SQL pgvector layer before prompt construction.
          </span>
        </div>
        {user && <SensitivityBadge level={user.sensitivity_clearance} size="sm" />}
      </div>

      {/* Query Bar */}
      <SearchBar
        query={query}
        setQuery={setQuery}
        onSearch={() => executeSearch()}
        isLoading={isLoading}
      />

      {error && (
        <div className="p-4 rounded-card bg-accent-danger/10 border border-accent-danger/30 text-accent-danger flex items-center gap-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* RAG Results with Citations and Mandatory Banner */}
      {result && <SearchResult result={result} onSelectDoc={onSelectDoc} />}

      {!result && !isLoading && (
        <Card className="py-16 text-center space-y-3 border-dashed">
          <div className="w-12 h-12 mx-auto rounded-full bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-h3 font-semibold text-text-primary">
            Ready for Case Intelligence Inquiries
          </h3>
          <p className="text-xs text-text-secondary max-w-md mx-auto">
            Input a natural language question above to query indexed exhibits, depositions, and reports.
            All citations are cryptographically verified against active case chunks.
          </p>
        </Card>
      )}
    </div>
  );
};
