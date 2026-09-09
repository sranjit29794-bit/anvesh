import React from 'react';
import { AuditLogEntry } from '@/types/document.types';
import { TableRow, TableCell } from '@/components/ui/Table';
import { formatDate } from '@/utils/formatDate';
import { Badge } from '@/components/ui/Badge';
import { Eye, Download, Upload, Search, Share2, ShieldCheck, LogIn, Lock, FileText } from 'lucide-react';

export interface AuditEventRowProps {
  entry: AuditLogEntry;
  onSelect?: (entry: AuditLogEntry) => void;
}

export const AuditEventRow: React.FC<AuditEventRowProps> = ({ entry, onSelect }) => {
  const getActionBadge = (actionStr: string) => {
    const action = actionStr.toUpperCase();
    switch (action) {
      case 'UPLOAD':
      case 'DOCUMENT_UPLOADED':
        return (
          <Badge variant="primary" size="sm" className="gap-1">
            <Upload className="w-3 h-3" /> UPLOAD
          </Badge>
        );
      case 'NEW_VERSION':
        return (
          <Badge variant="primary" size="sm" className="gap-1">
            <Upload className="w-3 h-3" /> VERSION REVISION
          </Badge>
        );
      case 'VIEW':
      case 'DOCUMENT_VIEWED':
        return (
          <Badge variant="default" size="sm" className="gap-1">
            <Eye className="w-3 h-3" /> VIEWED
          </Badge>
        );
      case 'DOWNLOAD':
      case 'DOCUMENT_DOWNLOADED':
        return (
          <Badge variant="warning" size="sm" className="gap-1">
            <Download className="w-3 h-3" /> DOWNLOAD
          </Badge>
        );
      case 'SEARCH':
      case 'SEARCH_QUERY':
        return (
          <Badge variant="primary" size="sm" className="gap-1">
            <Search className="w-3 h-3" /> RAG SEARCH
          </Badge>
        );
      case 'DOCUMENT_SHARED':
      case 'SHARE_REQUESTED':
      case 'SHARE_INITIATED':
        return (
          <Badge variant="success" size="sm" className="gap-1">
            <Share2 className="w-3 h-3" /> SHARE INITIATED
          </Badge>
        );
      case 'SHARE_APPROVED':
        return (
          <Badge variant="success" size="sm" className="gap-1">
            <ShieldCheck className="w-3 h-3" /> DUAL-AUTH APPROVED
          </Badge>
        );
      case 'SHARE_REJECTED':
        return (
          <Badge variant="danger" size="sm" className="gap-1">
            <Lock className="w-3 h-3" /> SHARE REJECTED
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
        return <Badge size="sm">{actionStr}</Badge>;
    }
  };

  const roleVariant =
    entry.user_role?.toUpperCase() === 'ADMIN'
      ? 'danger'
      : entry.user_role?.toUpperCase() === 'SUPERVISOR'
      ? 'warning'
      : 'default';

  return (
    <TableRow
      onClick={() => onSelect && onSelect(entry)}
      className="cursor-pointer font-mono text-xs hover:bg-bg-elevated/70 transition-colors"
    >
      <TableCell className="text-text-muted whitespace-nowrap">
        {formatDate(entry.timestamp)}
      </TableCell>
      <TableCell className="whitespace-nowrap">{getActionBadge(entry.action)}</TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="flex items-center gap-1.5 font-sans">
          <span className="font-semibold text-text-primary text-xs">{entry.username}</span>
          {entry.user_role && (
            <Badge variant={roleVariant} size="sm" className="text-[10px] py-0 px-1 font-mono">
              {entry.user_role}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="font-sans text-xs text-text-primary max-w-[280px]">
        <div className="truncate font-medium text-text-secondary" title={entry.description}>
          {entry.description || `${entry.username} performed ${entry.action}`}
        </div>
      </TableCell>
      <TableCell className="text-text-secondary truncate max-w-[120px] text-[11px]" title={entry.resource_id || ''}>
        {entry.resource_type ? (
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3 text-text-muted shrink-0" />
            <span className="capitalize">{entry.resource_type}</span>
          </span>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="text-text-secondary truncate max-w-[130px] text-[11px]" title={entry.case_id || ''}>
        {entry.case_number || (entry.case_id ? `...${entry.case_id.slice(-8)}` : '—')}
      </TableCell>
      <TableCell className="text-text-muted text-[11px] whitespace-nowrap">{entry.ip_address}</TableCell>
      <TableCell className="text-right">
        <span className="text-[11px] text-accent-primary font-sans hover:underline cursor-pointer">
          Inspect Payload
        </span>
      </TableCell>
    </TableRow>
  );
};
