import React, { useState, useEffect } from 'react';
import { DocumentRecord } from '@/types/document.types';
import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { ShareModal } from '@/components/sharing/ShareModal';
import { documentsService } from '@/services/documents.service';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';

export interface DocumentViewPageProps {
  docId: string;
  onBack: () => void;
  navigate: (route: string) => void;
}

export const DocumentView: React.FC<DocumentViewPageProps> = ({
  docId,
  onBack,
}) => {
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharingDoc, setSharingDoc] = useState<DocumentRecord | null>(null);

  const fetchDoc = async () => {
    if (!docId) {
      setIsLoading(false);
      setError('No document specified. Please select a document from a case folder or dashboard.');
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await documentsService.getDocument(
        docId,
        user?.user_id,
        user?.full_name || user?.username
      );
      setDoc(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDoc();
  }, [docId, user]);

  if (isLoading) {
    return (
      <div className="py-20 text-center text-xs text-text-muted">
        Decrypting DEK and loading evidence from secure vault...
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="py-16 text-center space-y-4">
        <div className="text-sm font-semibold text-accent-danger">{error || 'Document not found'}</div>
        <Button variant="secondary" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="w-4 h-4" />}>
          Back to Folder
        </Button>
      </div>
    );
  }

  return (
    <div>
      <DocumentViewer
        document={doc}
        onBack={onBack}
        onShare={(d) => setSharingDoc(d)}
        onRefresh={fetchDoc}
      />

      {sharingDoc && (
        <ShareModal
          isOpen={Boolean(sharingDoc)}
          onClose={() => setSharingDoc(null)}
          document={sharingDoc}
        />
      )}
    </div>
  );
};
