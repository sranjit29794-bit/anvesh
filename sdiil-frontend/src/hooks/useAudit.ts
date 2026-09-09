import { useState, useEffect, useCallback } from 'react';
import { AuditLogEntry } from '@/types/document.types';
import { db, delay } from '@/services/api';

export function useAudit(initialFilter?: { docId?: string; caseId?: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    await delay(100);
    let filtered = [...db.auditLogs];

    if (initialFilter?.docId) {
      filtered = filtered.filter((l) => l.doc_id === initialFilter.docId);
    }
    if (initialFilter?.caseId) {
      filtered = filtered.filter((l) => l.case_id === initialFilter.caseId);
    }

    if (filterAction !== 'ALL') {
      filtered = filtered.filter((l) => l.action === filterAction);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.username.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          (l.doc_id && l.doc_id.toLowerCase().includes(q)) ||
          l.ip_address.includes(q)
      );
    }

    setLogs(filtered);
    setIsLoading(false);
  }, [initialFilter?.docId, initialFilter?.caseId, filterAction, searchTerm]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    isLoading,
    filterAction,
    setFilterAction,
    searchTerm,
    setSearchTerm,
    refresh: fetchLogs,
  };
}
