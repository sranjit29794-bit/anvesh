import React, { useState, useEffect } from 'react';
import { DocumentUpload as DocumentUploadComponent } from '@/components/documents/DocumentUpload';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/services/api';
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
  const { user, caseAssignments } = useAuth();
  const [caseList, setCaseList] = useState<Array<{ id: string; case_number: string; title: string }>>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    defaultCaseId || 'MH-PN-2026-0142'
  );

  useEffect(() => {
    if (caseAssignments && caseAssignments.length > 0) {
      const realCases = caseAssignments.map((a) => ({
        id: a.cases?.id || a.case_id,
        case_number: a.cases?.case_number || a.case_id,
        title: a.cases?.title || 'Assigned Case',
      }));
      setCaseList(realCases);
      if (!realCases.some((c) => c.id === selectedCaseId || c.case_number === selectedCaseId)) {
        setSelectedCaseId(realCases[0].id);
      }
    } else {
      const assigned = db.cases
        .filter((c) => user?.role === 'ADMIN' || (user?.case_ids && user.case_ids.includes(c.case_id)))
        .map((c) => ({ id: c.case_id, case_number: c.case_number, title: c.title }));
      setCaseList(assigned);
      if (assigned.length > 0 && !assigned.some((c) => c.id === selectedCaseId)) {
        setSelectedCaseId(assigned[0].id);
      }
    }
  }, [user, caseAssignments, selectedCaseId]);

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
            {caseList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.case_number} — {c.title.slice(0, 35)}...
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
