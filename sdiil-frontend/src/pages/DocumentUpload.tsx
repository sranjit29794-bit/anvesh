import React, { useState, useEffect } from 'react';
import { DocumentUpload as DocumentUploadComponent } from '@/components/documents/DocumentUpload';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/services/api';
import { CaseRecord } from '@/types/case.types';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, FolderLock } from 'lucide-react';

export interface DocumentUploadPageProps {
  navigate: (route: string) => void;
  defaultCaseId?: string;
}

export const DocumentUpload: React.FC<DocumentUploadPageProps> = ({
  navigate,
  defaultCaseId,
}) => {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    defaultCaseId || 'case-del-2024-001'
  );

  useEffect(() => {
    const assigned = db.cases.filter(
      (c) => user?.role === 'ADMIN' || (user?.case_ids && user.case_ids.includes(c.case_id))
    );
    setCases(assigned);
    if (assigned.length > 0 && !assigned.some((c) => c.case_id === selectedCaseId)) {
      setSelectedCaseId(assigned[0].case_id);
    }
  }, [user, selectedCaseId]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/dashboard')}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          Back to Dashboard
        </Button>

        <div className="flex items-center gap-2">
          <FolderLock className="w-4 h-4 text-accent-primary" />
          <span className="text-label text-text-muted">Target Case Folder:</span>
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="bg-bg-elevated text-text-primary text-xs border border-border rounded-input py-1.5 px-3 outline-none focus:border-accent-primary"
          >
            {cases.map((c) => (
              <option key={c.case_id} value={c.case_id}>
                {c.case_number} — {c.title.slice(0, 30)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ingest Component */}
      <DocumentUploadComponent
        caseId={selectedCaseId}
        onSuccess={() => {
          // Keep on page to view confirmation or navigate
        }}
      />
    </div>
  );
};
