import React from 'react';
import { AuditLogEntry } from '@/types/document.types';
import { TableRow, TableCell } from '@/components/ui/Table';
import { formatDate } from '@/utils/formatDate';
import { Badge } from '@/components/ui/Badge';
import { Eye, Download, Upload, Search, Share2, ShieldCheck, LogIn, Lock } from 'lucide-react';

export interface AuditEventRowProps {
  entry: AuditLogEntry;
  onSelect?: (entry: AuditLogEntry) => void;
}

export const AuditEventRow: React.FC<AuditEventRowProps> = ({ entry, onSelect }) => {
  const getActionBadge = (action: AuditLogEntry['action']) => {
    switch (action) {
      case 'DOCUMENT_UPLOADED':
        return (
          <Badge variant="primary" size="sm" className="gap-1">
            <Upload className="w-3 h-3" /> UPLOADED
          </Badge>
        );
      case 'DOCUMENT_VIEWED':
        return (
          <Badge variant="default" size="sm" className="gap-1">
            <Eye className="w-3 h-3" /> VIEWED
          </Badge>
        );
      case 'DOCUMENT_DOWNLOADED':
        return (
          <Badge variant="warning" size="sm" className="gap-1">
            <Download className="w-3 h-3" /> DOWNLOADED
          </Badge>
        );
      case 'SEARCH_QUERY':
        return (
          <Badge variant="primary" size="sm" className="gap-1">
            <Search className="w-3 h-3" /> RAG SEARCH
          </Badge>
        );
      case 'DOCUMENT_SHARED':
      case 'SHARE_INITIATED':
        return (
          <Badge variant="success" size="sm" className="gap-1">
            <Share2 className="w-3 h-3" /> SHARED
          </Badge>
        );
      case 'SHARE_APPROVED':
        return (
          <Badge variant="success" size="sm" className="gap-1">
            <ShieldCheck className="w-3 h-3" /> APPROVED
          </Badge>
        );
      case 'SHARE_REJECTED':
        return (
          <Badge variant="danger" size="sm" className="gap-1">
            <Lock className="w-3 h-3" /> REJECTED
          </Badge>
        );
      case 'VERIFICATION_REQUESTED':
      case 'VERIFICATION_REPORT_GENERATED':
        return (
          <Badge variant="primary" size="sm" className="gap-1">
            <ShieldCheck className="w-3 h-3" /> VERIFIED
          </Badge>
        );
      case 'LOGIN_SUCCESS':
        return (
          <Badge variant="success" size="sm" className="gap-1">
            <LogIn className="w-3 h-3" /> LOGIN
          </Badge>
        );
      case 'LOGIN_FAILED':
      case 'MFA_FAILED':
      case 'MFA_LOCKOUT':
        return (
          <Badge variant="danger" size="sm" className="gap-1">
            <Lock className="w-3 h-3" /> AUTH FAILED
          </Badge>
        );
      default:
        return <Badge size="sm">{action}</Badge>;
    }
  };

  return (
    <TableRow
      onClick={() => onSelect && onSelect(entry)}
      className="cursor-pointer font-mono text-xs hover:bg-bg-elevated/70"
    >
      <TableCell className="text-text-muted whitespace-nowrap">
        {formatDate(entry.timestamp)}
      </TableCell>
      <TableCell className="whitespace-nowrap">{getActionBadge(entry.action)}</TableCell>
      <TableCell className="font-semibold text-text-primary whitespace-nowrap">
        {entry.username}
      </TableCell>
      <TableCell className="text-text-secondary truncate max-w-[140px]">
        {entry.doc_id || '—'}
      </TableCell>
      <TableCell className="text-text-secondary truncate max-w-[140px]">
        {entry.case_id || '—'}
      </TableCell>
      <TableCell className="text-text-muted">{entry.ip_address}</TableCell>
      <TableCell className="text-right">
        <span className="text-[10px] text-accent-primary hover:underline">Inspect JSON</span>
      </TableCell>
    </TableRow>
  );
};
