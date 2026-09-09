import { db, delay } from './api';
import { supabase } from './supabase.client';
import { AuditLogEntry } from '@/types/document.types';

export interface AuditQueryFilters {
  caseId?: string;
  action?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  searchTerm?: string;
  limit?: number;
  offset?: number;
}

export const auditService = {
  /**
   * Helper to retrieve current Supabase session token
   */
  async getAuthToken(): Promise<string | null> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  },

  /**
   * Query immutable audit trail from real backend GET /api/v1/audit
   */
  async getAuditLogs(filters?: AuditQueryFilters): Promise<{ logs: AuditLogEntry[]; count: number }> {
    const token = await this.getAuthToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (token) {
      try {
        const query = new URLSearchParams();
        if (filters?.caseId && filters.caseId !== 'ALL') query.set('case_id', filters.caseId);
        if (filters?.action && filters.action !== 'ALL') query.set('action', filters.action);
        if (filters?.userId) query.set('user_id', filters.userId);
        if (filters?.startDate) query.set('start_date', filters.startDate);
        if (filters?.endDate) query.set('end_date', filters.endDate);
        if (filters?.limit) query.set('limit', String(filters.limit));
        if (filters?.offset) query.set('offset', String(filters.offset));

        const res = await fetch(`${apiBase}/audit?${query.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.audit_logs)) {
            const logs: AuditLogEntry[] = data.audit_logs.map((row: any) => ({
              log_id: row.id || row.log_id,
              user_id: row.user_id,
              username: row.username || row.user_name || 'Officer',
              user_role: row.user_role || 'OFFICER',
              action: row.action,
              resource_type: row.resource_type || 'document',
              resource_id: row.resource_id,
              description: row.description,
              doc_id: row.doc_id || row.resource_id,
              case_id: row.case_id,
              case_number: row.case_number,
              timestamp: row.created_at || row.timestamp,
              ip_address: row.ip_address || '127.0.0.1',
              metadata: row.metadata || {},
            }));

            return { logs, count: data.count || logs.length };
          }
        }
      } catch (err) {
        console.warn('[auditService] Remote audit API error, using in-memory fallback:', err);
      }
    }

    // In-memory fallback
    await delay(120);
    let filtered = [...db.auditLogs];

    if (filters?.caseId && filters.caseId !== 'ALL') {
      filtered = filtered.filter((l) => l.case_id === filters.caseId);
    }
    if (filters?.action && filters.action !== 'ALL') {
      filtered = filtered.filter((l) => l.action.toLowerCase() === filters.action?.toLowerCase());
    }
    if (filters?.searchTerm) {
      const q = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.username.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          (l.doc_id && l.doc_id.toLowerCase().includes(q)) ||
          l.ip_address.includes(q)
      );
    }

    return { logs: filtered, count: filtered.length };
  },
};
