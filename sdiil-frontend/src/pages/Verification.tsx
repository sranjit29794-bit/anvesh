import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/services/api';
import { verificationService } from '@/services/verification.service';
import { TamperVerificationResult } from '@/types/document.types';
import { VerificationStatus } from '@/components/verification/VerificationStatus';
import { ReportDownload } from '@/components/verification/ReportDownload';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, RefreshCw, Bug } from 'lucide-react';
import { documentsService } from '@/services/documents.service';

export interface VerificationPageProps {
  initialDocId?: string;
}

export const Verification: React.FC<VerificationPageProps> = ({ initialDocId }) => {
  const { user } = useAuth();
  const [selectedDocId, setSelectedDocId] = useState<string>(
    initialDocId || 'doc-del-001'
  );
  const [result, setResult] = useState<TamperVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const runVerification = async (targetDocId: string) => {
    if (!user) return;
    setIsVerifying(true);
    const doc = db.documents.find((d) => d.file_id === targetDocId) || db.documents[0];
    try {
      const res = await verificationService.verifyDocument(
        doc.case_id,
        doc.file_id,
        user.user_id,
        user.full_name || user.username
      );
      setResult(res);
    } catch {
      alert('Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (selectedDocId) {
      runVerification(selectedDocId);
    }
  }, [selectedDocId, user]);

  const handleToggleTamper = async () => {
    await documentsService.toggleTamperSimulation(selectedDocId);
    await runVerification(selectedDocId);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-h1 font-bold text-text-primary flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-accent-primary" />
            Court-Grade Tamper Verification
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Real-time hash recalculation against immutable blockchain registrations.
          </p>
        </div>

        {/* Document Selector & Action Controls */}
        <div className="flex items-center gap-2.5">
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="bg-bg-card text-text-primary text-xs border border-border rounded-btn py-2 px-3 outline-none focus:border-accent-primary font-medium"
          >
            {db.documents.map((d) => (
              <option key={d.file_id} value={d.file_id}>
                {d.title.slice(0, 35)}... (Level {d.sensitivity_level})
              </option>
            ))}
          </select>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => runVerification(selectedDocId)}
            isLoading={isVerifying}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Re-Verify
          </Button>

          {/* Dev Tamper Toggle */}
          <Button
            variant="danger"
            size="sm"
            onClick={handleToggleTamper}
            leftIcon={<Bug className="w-3.5 h-3.5" />}
            title="Toggle deliberate hash mismatch for court alert inspection"
          >
            Tamper Toggle
          </Button>
        </div>
      </div>

      {isVerifying && (
        <Card className="py-16 text-center space-y-3">
          <div className="w-10 h-10 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-semibold text-text-primary">
            Computing SHA-256 on Decrypted Stream...
          </div>
          <p className="text-xs text-text-muted">
            Checking GCM tags, blockchain anchor entries, and access event timelines.
          </p>
        </Card>
      )}

      {result && !isVerifying && (
        <div className="space-y-6">
          <VerificationStatus result={result} />
          <ReportDownload result={result} />
        </div>
      )}
    </div>
  );
};
