import React, { useState } from 'react';
import { AuditLogEntry } from '@/types/document.types';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { AuditEventRow } from './AuditEventRow';
import { Modal } from '@/components/ui/Modal';
import { Shield, Filter, Search } from 'lucide-react';

export interface AuditTableProps {
  logs: AuditLogEntry[];
  filterAction: string;
  setFilterAction: (act: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isLoading: boolean;
}

export const AuditTable: React.FC<AuditTableProps> = ({
  logs,
  filterAction,
  setFilterAction,
  searchTerm,
  setSearchTerm,
  isLoading,
}) => {
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const actionOptions = [
    { value: 'ALL', label: 'All Immutable Events' },
    { value: 'DOCUMENT_UPLOADED', label: 'Upload Events' },
    { value: 'DOCUMENT_VIEWED', label: 'View Events' },
    { value: 'DOCUMENT_DOWNLOADED', label: 'Download Events' },
    { value: 'SEARCH_QUERY', label: 'RAG Search Events' },
    { value: 'DOCUMENT_SHARED', label: 'Sharing Grants' },
    { value: 'SHARE_APPROVED', label: 'Dual-Auth Approvals' },
    { value: 'VERIFICATION_REQUESTED', label: 'Verification Runs' },
    { value: 'LOGIN_SUCCESS', label: 'Auth Logins' },
    { value: 'LOGIN_FAILED', label: 'Auth Failures' },
  ];

  return (
    <div className="space-y-4">
      {/* Read-Only Banner */}
      <div className="flex items-center justify-between p-3 rounded-card bg-bg-card border border-border">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Shield className="w-4 h-4 text-accent-primary" />
          <span>
            <strong>Immutable Audit Store:</strong> Application service account has <code className="text-accent-primary">INSERT-ONLY</code> privileges. Rows cannot be edited or deleted.
          </span>
        </div>
        <span className="text-[11px] font-mono text-text-muted">Total Events: {logs.length}</span>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by officer username, doc_id, case_id, or IP..."
            className="w-full pl-9 pr-3 py-2 bg-bg-elevated text-text-primary text-xs border border-border rounded-input outline-none focus:border-accent-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-text-muted shrink-0" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-bg-elevated text-text-primary text-xs border border-border rounded-input py-2 px-3 outline-none focus:border-accent-primary cursor-pointer w-full sm:w-auto"
          >
            {actionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp (UTC)</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Officer</TableHead>
            <TableHead>Document ID</TableHead>
            <TableHead>Case ID</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead className="text-right">Payload</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-xs text-text-muted">
                Querying audit trail ledger...
              </TableCell>
            </TableRow>
          ) : logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-xs text-text-muted">
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
      >
        {selectedEntry && (
          <div className="space-y-3 font-mono text-xs">
            <div className="grid grid-cols-2 gap-2 bg-bg-secondary p-3 rounded-card border border-border">
              <div>
                <span className="text-text-muted text-[10px] block">Actor:</span>
                <span className="text-text-primary">{selectedEntry.username} ({selectedEntry.user_id})</span>
              </div>
              <div>
                <span className="text-text-muted text-[10px] block">IP Address:</span>
                <span className="text-text-primary">{selectedEntry.ip_address}</span>
              </div>
              <div>
                <span className="text-text-muted text-[10px] block">Document ID:</span>
                <span className="text-text-primary">{selectedEntry.doc_id || 'N/A'}</span>
              </div>
              <div>
                <span className="text-text-muted text-[10px] block">Case ID:</span>
                <span className="text-text-primary">{selectedEntry.case_id || 'N/A'}</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-mono text-text-muted uppercase block mb-1">
                Metadata JSON (INSERT-ONLY Application Storage):
              </span>
              <pre className="bg-bg-primary p-3 rounded-card border border-border text-text-secondary overflow-x-auto text-[11px] leading-relaxed">
                {JSON.stringify(selectedEntry.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
