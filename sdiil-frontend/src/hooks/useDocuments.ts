import { useState, useEffect, useCallback } from 'react';
import { DocumentRecord, DocType } from '@/types/document.types';
import { documentsService } from '@/services/documents.service';
import { useAuth } from './useAuth';
import {
  canViewDocument,
  canDownloadDocument,
  canUploadDocument,
  canInitiateShare,
  ABACPermissionResult,
} from '@/utils/roleGuard';

export function useDocuments(caseId?: string) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!caseId) {
      setDocuments([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const docs = await documentsService.getDocumentsByCase(caseId);
      setDocuments(docs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load case documents');
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Helper to evaluate ABAC permission for any given document for the active user
  const checkDocAccess = (doc: DocumentRecord) => {
    return {
      canView: canViewDocument(user, doc),
      canDownload: canDownloadDocument(user, doc),
      canShare: canInitiateShare(user, doc),
    };
  };

  // Helper to evaluate upload capability
  const checkUploadPermission = (docType?: DocType): ABACPermissionResult => {
    return canUploadDocument(user, caseId || '', docType);
  };

  const uploadDocument = async (file: File, docType?: DocType) => {
    if (!caseId || !user) throw new Error('Missing case or user credentials');
    const res = await documentsService.uploadDocument(
      caseId,
      file,
      user.user_id,
      user.full_name || user.username,
      docType
    );
    await fetchDocuments();
    return res;
  };

  const uploadNewVersion = async (docId: string, file: File, summary: string) => {
    if (!user) throw new Error('Authentication required');
    const updated = await documentsService.uploadNewVersion(
      docId,
      file,
      user.user_id,
      user.full_name || user.username,
      summary
    );
    await fetchDocuments();
    return updated;
  };

  const downloadDocument = async (doc: DocumentRecord) => {
    if (!user) throw new Error('Authentication required');
    const { blob, filename } = await documentsService.downloadDocument(
      doc.file_id,
      user.user_id,
      user.full_name || user.username
    );
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${doc.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${doc.version}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const toggleTamper = async (docId: string) => {
    const updated = await documentsService.toggleTamperSimulation(docId);
    await fetchDocuments();
    return updated;
  };

  return {
    documents,
    isLoading,
    error,
    refresh: fetchDocuments,
    checkDocAccess,
    checkUploadPermission,
    uploadDocument,
    uploadNewVersion,
    downloadDocument,
    toggleTamper,
  };
}
