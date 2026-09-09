import React, { useState } from 'react';
import { AuditLogEntry } from '@/types/document.types';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { AuditEventRow } from './AuditEventRow';
import { Modal } from '@/components/ui/Modal';
import { Shield, Filter, Search, Calendar, FolderGit2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface AuditTableProps {
  logs: AuditLogEntry[];
  totalCount?: number;
  filterAction: string;
  setFilterAction: (act: string) => void;
  filterCaseId?: string;
  setFilterCaseId?: (caseId: string) => void;
  startDate?: string;
  setStartDate?: (date: string) => void;
  endDate?: string;
  setEndDate?: (date: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isLoading: boolean;
  onRefresh?: () => void;
}

export const AuditTable: React.FC<AuditTableProps> = ({
  logs,
  totalCount,
  filterAction,
  setFilterAction,
  filterCaseId = 'ALL',
  setFilterCaseId,
  startDate: _startDate = '',
  setStartDate,
  endDate: _endDate = '',
  setEndDate,
  searchTerm,
  setSearchTerm,
  isLoading,
  onRefresh,
}) => {
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const actionOptions = [
    { value: 'ALL', label: 'All Immutable Actions' },
    { value: 'upload', label: 'Upload Events' },
    { value: 'download', label: 'Download Events' },
    { value: 'new_version', label: 'Version Revisions' },
    { value: 'share_requested', label: 'Share Requests' },
    { value: 'share_approved', label: 'Dual-Auth Approvals' },
    { value: 'share_rejected', label: 'Share Rejections' },
    { value: 'verification_requested', label: 'Verification Runs' },
    { value: 'search_query', label: 'ABAC Semantic Search' },
    { value: 'login_success', label: 'Auth Logins' },
    { value: 'login_failed', label: 'Auth Failures' },
  ];

  const caseOptions = [
    { value: 'ALL', label: 'All Scoped Cases' },
    { value: 'MH-PN-2026-0142', label: 'MH-PN-2026-0142 (State vs. Shinde)' },
    { value: 'MH-PN-2026-0198', label: 'MH-PN-2026-0198 (Syndicate Crime - Level A)' },
    { value: 'MH-PN-2026-0210', label: 'MH-PN-2026-0210 (Commercial Fraud)' },
  ];

  const handleDatePreset = (preset: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH') => {
    if (!setStartDate || !setEndDate) return;
    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
      return;
    }
    const now = new Date();
    if (preset === 'TODAY') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      setStartDate(start);
      setEndDate('');
    } else if (preset === 'WEEK') {
      const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      setStartDate(start);
      setEndDate('');
    } else if (preset === 'MONTH') {
      const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
      setStartDate(start);
      setEndDate('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Read-Only Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-card bg-bg-card border border-border gap-2">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Shield className="w-4 h-4 text-accent-primary shrink-0" />
          <span>
            <strong>Immutable Statutory Audit Store:</strong> PostgreSQL database level enforces{' '}
            <code className="text-accent-primary bg-bg-elevated px-1.5 py-0.5 rounded border border-border">
              INSERT-ONLY
            </code>{' '}
            privileges. Zero edit or delete operations permitted.
          </span>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              isLoading={isLoading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
          )}
          <span className="text-[11px] font-mono text-text-muted bg-bg-secondary px-2 py-1 rounded border border-border">
            Showing: {logs.length} {totalCount ? `/ Total: ${totalCount}` : ''}
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-bg-secondary p-3 rounded-card border border-border">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search officer, action, doc..."
            className="w-full pl-9 pr-3 py-1.5 bg-bg-elevated text-text-primary text-xs border border-border rounded-input outline-none focus:border-accent-primary"
          />
        </div>

        {/* Case Filter */}
        <div className="flex items-center gap-1.5 bg-bg-elevated border border-border rounded-input px-2 py-1">
          <FolderGit2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <select
            value={filterCaseId}
            onChange={(e) => setFilterCaseId && setFilterCaseId(e.target.value)}
            className="w-full bg-transparent text-text-primary text-xs outline-none cursor-pointer"
          >
            {caseOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-bg-elevated text-text-primary">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Action Filter */}
        <div className="flex items-center gap-1.5 bg-bg-elevated border border-border rounded-input px-2 py-1">
          <Filter className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full bg-transparent text-text-primary text-xs outline-none cursor-pointer"
          >
            {actionOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-bg-elevated text-text-primary">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date Presets */}
        <div className="flex items-center gap-1.5 bg-bg-elevated border border-border rounded-input px-2 py-1">
          <Calendar className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <select
            onChange={(e) => handleDatePreset(e.target.value as any)}
            defaultValue="ALL"
            className="w-full bg-transparent text-text-primary text-xs outline-none cursor-pointer"
          >
            <option value="ALL" className="bg-bg-elevated text-text-primary">
              Date: All Time
            </option>
            <option value="TODAY" className="bg-bg-elevated text-text-primary">
              Date: Today
            </option>
            <option value="WEEK" className="bg-bg-elevated text-text-primary">
              Date: Last 7 Days
            </option>
            <option value="MONTH" className="bg-bg-elevated text-text-primary">
              Date: Last 30 Days
            </option>
          </select>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Timestamp</TableHead>
            <TableHead className="w-[120px]">Action</TableHead>
            <TableHead className="w-[180px]">Officer / Actor</TableHead>
            <TableHead>Event Description</TableHead>
            <TableHead className="w-[110px]">Resource</TableHead>
            <TableHead className="w-[140px]">Case</TableHead>
            <TableHead className="w-[110px]">IP Address</TableHead>
            <TableHead className="text-right w-[110px]">Payload</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-10 text-xs text-text-muted">
                Querying immutable audit trail ledger...
              </TableCell>
            </TableRow>
          ) : logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-10 text-xs text-text-muted">
                No audit records matching filter criteria.
              </TableCell>
            </TableRow>
          ) : (
            logs.map((entry) => (
              <AuditEventRow
                key={entry.log_id}
                entry={entry}
                onSelect={(ent) => setSelectedEntry(ent)}
              />
            ))
          )}
        </TableBody>
      </Table>

      {/* JSON Metadata Inspector Modal */}
      <Modal
        isOpen={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title="Audit Record Payload Inspector"
        subtitle={`Log ID: ${selectedEntry?.log_id} • Action: ${selectedEntry?.action}`}
        maxWidth="lg"
      >
        {selectedEntry && (
          <div className="space-y-3 font-mono text-xs">
            <div className="grid grid-cols-2 gap-2 bg-bg-secondary p-3 rounded-card border border-border">
              <div>
                <span className="text-text-muted text-[10px] block">Actor:</span>
                <span className="text-text-primary font-semibold">
                  {selectedEntry.username} ({selectedEntry.user_role || 'officer'})
                </span>
                <span className="text-[10px] text-text-muted block mt-0.5">ID: {selectedEntry.user_id}</span>
              </div>
              <div>
                <span className="text-text-muted text-[10px] block">Timestamp (UTC):</span>
                <span className="text-text-primary">{selectedEntry.timestamp}</span>
                <span className="text-[10px] text-text-muted block mt-0.5">IP: {selectedEntry.ip_address}</span>
              </div>
              <div>
                <span className="text-text-muted text-[10px] block">Document / Resource ID:</span>
                <span className="text-text-primary">{selectedEntry.doc_id || selectedEntry.resource_id || 'N/A'}</span>
              </div>
              <div>
                <span className="text-text-muted text-[10px] block">Case ID / Number:</span>
                <span className="text-text-primary">
                  {selectedEntry.case_number || selectedEntry.case_id || 'N/A'}
                </span>
              </div>
              <div className="col-span-2 pt-1 border-t border-border">
                <span className="text-text-muted text-[10px] block">Description:</span>
                <span className="text-text-primary font-sans">{selectedEntry.description || selectedEntry.action}</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-mono text-text-muted uppercase block mb-1">
                Raw Metadata JSON (Permanently Sealed in Append-Only Store):
              </span>
              <pre className="bg-bg-primary p-3 rounded-card border border-border text-text-secondary overflow-x-auto text-[11px] leading-relaxed max-h-[300px]">
                {JSON.stringify(selectedEntry.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
