import { useState, useEffect, useCallback } from 'react';
import { AuditLogEntry } from '@/types/document.types';
import { auditService } from '@/services/audit.service';

export interface UseAuditOptions {
  docId?: string;
  caseId?: string;
}

export function useAudit(initialFilter?: UseAuditOptions) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [filterCaseId, setFilterCaseId] = useState<string>(initialFilter?.caseId || 'ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const { logs: fetched, count } = await auditService.getAuditLogs({
        caseId: filterCaseId !== 'ALL' ? filterCaseId : initialFilter?.caseId,
        action: filterAction !== 'ALL' ? filterAction : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        searchTerm: searchTerm || undefined,
      });

      // Filter locally if searchTerm exists
      let filtered = fetched;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        filtered = filtered.filter(
          (l) =>
            l.username.toLowerCase().includes(q) ||
            l.action.toLowerCase().includes(q) ||
            (l.description && l.description.toLowerCase().includes(q)) ||
            (l.doc_id && l.doc_id.toLowerCase().includes(q)) ||
            (l.case_id && l.case_id.toLowerCase().includes(q)) ||
            l.ip_address.includes(q)
        );
      }

      setLogs(filtered);
      setTotalCount(count);
    } catch (err) {
      console.warn('[useAudit] Fetch audit logs notice:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filterCaseId, filterAction, startDate, endDate, searchTerm, initialFilter?.caseId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    totalCount,
    isLoading,
    filterAction,
    setFilterAction,
    filterCaseId,
    setFilterCaseId,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    searchTerm,
    setSearchTerm,
    refresh: fetchLogs,
  };
}
