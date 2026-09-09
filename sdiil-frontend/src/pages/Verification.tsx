import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/services/supabase.client';
import { db } from '@/services/api';
import { verificationService } from '@/services/verification.service';
import { TamperVerificationResult } from '@/types/document.types';
import { VerificationStatus } from '@/components/verification/VerificationStatus';
import { ReportDownload } from '@/components/verification/ReportDownload';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, RefreshCw, Bug, AlertTriangle } from 'lucide-react';

export interface VerificationPageProps {
  initialDocId?: string;
}

interface SelectableDoc {
  id: string;
  case_id: string;
  title: string;
  case_number?: string;
  sensitivity_level?: string;
}

export const Verification: React.FC<VerificationPageProps> = ({ initialDocId }) => {
  const { user } = useAuth();
  const [docList, setDocList] = useState<SelectableDoc[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocId || '');
  const [result, setResult] = useState<TamperVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [simulatedTamper, setSimulatedTamper] = useState(false);

  // Load accessible documents from Supabase under RLS
  useEffect(() => {
    let isMounted = true;
    async function loadDocuments() {
      try {
        const { data: sbDocs, error } = await supabase
          .from('documents')
          .select(`
            id,
            case_id,
            title,
            sensitivity_level,
            cases (
              case_number
            )
          `)
          .order('created_at', { ascending: false });

        if (!error && sbDocs && sbDocs.length > 0) {
          const mapped: SelectableDoc[] = sbDocs.map((d: any) => ({
            id: d.id,
            case_id: d.case_id,
            title: d.title,
            case_number: Array.isArray(d.cases) ? d.cases[0]?.case_number : d.cases?.case_number,
            sensitivity_level: d.sensitivity_level,
          }));

          if (isMounted) {
            setDocList(mapped);
            if (!selectedDocId || !mapped.some((m) => m.id === selectedDocId)) {
              setSelectedDocId(initialDocId && mapped.some((m) => m.id === initialDocId) ? initialDocId : mapped[0].id);
            }
          }
          return;
        }
      } catch (err) {
        console.warn('[Verification] Supabase document fetch error, falling back to mock:', err);
      }

      // Fallback
      if (isMounted) {
        const fallback: SelectableDoc[] = db.documents.map((d) => ({
          id: d.file_id,
          case_id: d.case_id,
          title: d.title,
          case_number: d.case_id,
          sensitivity_level: d.sensitivity_level,
        }));
        setDocList(fallback);
        if (!selectedDocId && fallback.length > 0) {
          setSelectedDocId(fallback[0].id);
        }
      }
    }

    loadDocuments();
    return () => {
      isMounted = false;
    };
  }, [initialDocId]);

  const runVerification = async (targetDocId: string) => {
    if (!user || !targetDocId) return;
    setIsVerifying(true);
    setSimulatedTamper(false);

    const doc = docList.find((d) => d.id === targetDocId) || docList[0];
    const caseId = doc?.case_id || 'MH-PN-2026-0142';

    try {
      const res = await verificationService.verifyDocument(
        caseId,
        targetDocId,
        user.user_id,
        user.full_name || user.username
      );
      setResult(res);
    } catch (err) {
      console.error('[Verification] Check failed:', err);
      alert('Verification failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (selectedDocId) {
      runVerification(selectedDocId);
    }
  }, [selectedDocId, user]);

  const handleToggleTamper = () => {
    if (!result) return;
    if (!simulatedTamper) {
      // Flip into simulated tampered state for court inspection demo
      const fakeComputedHash = 'a48640dedebb1a4cb4fe2bb7f7300acad22e34dfcf70290d6f36556faa41578f';
      setResult({
        ...result,
        status: 'TAMPERED',
        verification_status: 'TAMPERED',
        is_valid: false,
        hashes_match: false,
        storage_integrity_failure: true,
        computed_hash: fakeComputedHash,
      });
      setSimulatedTamper(true);
    } else {
      // Re-run real cryptographic verification
      runVerification(selectedDocId);
    }
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
            Real-time SHA-256 recalculation on decrypted storage bytes against immutable blockchain anchors.
          </p>
        </div>

        {/* Document Selector & Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            disabled={isVerifying || docList.length === 0}
            className="bg-bg-card text-text-primary text-xs border border-border rounded-btn py-2 px-3 outline-none focus:border-accent-primary font-medium max-w-[260px] truncate"
          >
            {docList.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.case_number || d.case_id})
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

          {/* Dev / Judicial Tamper Simulation Toggle */}
          <Button
            variant={simulatedTamper ? 'primary' : 'danger'}
            size="sm"
            onClick={handleToggleTamper}
            leftIcon={<Bug className="w-3.5 h-3.5" />}
            title="Simulate storage tampering or bitrot to inspect high-impact alert banner"
          >
            {simulatedTamper ? 'Restore Verified' : 'Tamper Demo'}
          </Button>
        </div>
      </div>

      {simulatedTamper && (
        <div className="p-3 rounded-card bg-accent-danger/10 border border-accent-danger/40 flex items-center gap-3 text-xs text-accent-danger font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 animate-bounce" />
          <span>
            <strong>Tamper Demo Mode Active:</strong> Simulating byte-level storage corruption to demonstrate the Section 65B tamper alert banner and report generation. Click &quot;Restore Verified&quot; or &quot;Re-Verify&quot; to resume live verification.
          </span>
        </div>
      )}

      {isVerifying && (
        <Card className="py-16 text-center space-y-3">
          <div className="w-10 h-10 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-semibold text-text-primary">
            Computing SHA-256 on Live Decrypted Stream...
          </div>
          <p className="text-xs text-text-muted">
            Checking raw storage bytes, blockchain anchor entries, and access event timelines.
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
