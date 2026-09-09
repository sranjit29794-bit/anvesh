import React from 'react';
import { useAudit } from '@/hooks/useAudit';
import { AuditTable } from '@/components/audit/AuditTable';
import { History } from 'lucide-react';

export interface AuditTrailPageProps {
  filterDocId?: string;
  filterCaseId?: string;
}

export const AuditTrail: React.FC<AuditTrailPageProps> = ({ filterDocId, filterCaseId }) => {
  const { logs, isLoading, filterAction, setFilterAction, searchTerm, setSearchTerm } = useAudit({
    docId: filterDocId,
    caseId: filterCaseId,
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-h1 font-bold text-text-primary flex items-center gap-2.5">
            <History className="w-6 h-6 text-accent-primary" />
            Statutory Immutable Audit Trail
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Complete tamper-evident chronological ledger for upload, view, download, search, sharing, and verification events.
          </p>
        </div>
      </div>

      <AuditTable
        logs={logs}
        filterAction={filterAction}
        setFilterAction={setFilterAction}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isLoading={isLoading}
      />
    </div>
  );
};
