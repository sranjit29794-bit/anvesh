import React, { useEffect } from 'react';
import { useAudit } from '@/hooks/useAudit';
import { supabase } from '@/services/supabase.client';
import { AuditTable } from '@/components/audit/AuditTable';
import { History, Activity } from 'lucide-react';

export interface AuditTrailPageProps {
  filterDocId?: string;
  filterCaseId?: string;
}

export const AuditTrail: React.FC<AuditTrailPageProps> = ({ filterDocId, filterCaseId }) => {
  const {
    logs,
    totalCount,
    isLoading,
    filterAction,
    setFilterAction,
    filterCaseId: selectedCaseId,
    setFilterCaseId,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    searchTerm,
    setSearchTerm,
    refresh,
  } = useAudit({
    docId: filterDocId,
    caseId: filterCaseId,
  });

  // Supabase Realtime subscription on audit_log
  useEffect(() => {
    const channel = supabase
      .channel('audit_trail_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log' },
        () => {
          refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-h1 font-bold text-text-primary flex items-center gap-2.5">
            <History className="w-6 h-6 text-accent-primary" />
            Statutory Immutable Audit Trail
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Complete tamper-evident chronological ledger for upload, versioning, download, search, sharing, and verification events.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 text-xs font-mono bg-accent-success/10 text-accent-success border border-accent-success/30 px-2.5 py-1 rounded-full">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span>Realtime Live Feed</span>
          </div>
        </div>
      </div>

      <AuditTable
        logs={logs}
        totalCount={totalCount}
        filterAction={filterAction}
        setFilterAction={setFilterAction}
        filterCaseId={selectedCaseId}
        setFilterCaseId={setFilterCaseId}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isLoading={isLoading}
        onRefresh={refresh}
      />
    </div>
  );
};
