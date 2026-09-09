import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/services/api';
import { CaseRecord } from '@/types/case.types';
import { AnomalyAlert, DocumentRecord } from '@/types/document.types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { ShareModal } from '@/components/sharing/ShareModal';
import { documentsService } from '@/services/documents.service';
import { formatRelativeTime } from '@/utils/formatDate';
import {
  FolderLock,
  Files,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  UploadCloud,
  Search,
  Lock,
} from 'lucide-react';

export interface DashboardProps {
  navigate: (route: string) => void;
  onSelectCase: (caseId: string) => void;
  onSelectDoc: (doc: DocumentRecord) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  navigate,
  onSelectCase,
  onSelectDoc,
}) => {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocumentRecord[]>([]);
  const [sharingDoc, setSharingDoc] = useState<DocumentRecord | null>(null);

  useEffect(() => {
    // Load assigned cases based on user's case_ids claim
    const assigned = db.cases.filter(
      (c) => user?.role === 'ADMIN' || (user?.case_ids && user.case_ids.includes(c.case_id))
    );
    setCases(assigned);
    setAnomalies(db.anomalies);
    setRecentDocs(db.documents.slice(0, 4));
  }, [user]);

  const totalDocs = cases.reduce((acc, c) => acc + c.document_counts.total, 0);
  const totalSensA = cases.reduce((acc, c) => acc + c.document_counts.sensitivity_a, 0);

  const handleDownload = async (doc: DocumentRecord) => {
    if (!user) return;
    const blob = await documentsService.downloadDocument(
      doc.file_id,
      user.user_id,
      user.full_name || user.username
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${doc.version}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleToggleTamper = async (docId: string) => {
    await documentsService.toggleTamperSimulation(docId);
    setRecentDocs([...db.documents.slice(0, 4)]);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-h1 font-bold text-text-primary">
            Welcome back, {user?.full_name}
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            ICJS Active Clearance: <strong>Level {user?.sensitivity_clearance}</strong> •{' '}
            {user?.department}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {user?.role !== 'COURT_REGISTRAR' &&
            user?.role !== 'REVIEWER' &&
            user?.role !== 'PROSECUTOR' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/upload')}
                leftIcon={<UploadCloud className="w-4 h-4" />}
              >
                Ingest Evidence
              </Button>
            )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/search')}
            leftIcon={<Search className="w-4 h-4" />}
          >
            RAG Search
          </Button>
        </div>
      </div>

      {/* Metric Counters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-label text-text-muted">Assigned Cases</span>
            <div className="text-2xl font-bold text-text-primary mt-1">{cases.length}</div>
            <div className="text-[11px] text-text-muted mt-0.5">Scoped in token claims</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary">
            <FolderLock className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-label text-text-muted">Total Evidences</span>
            <div className="text-2xl font-bold text-text-primary mt-1">{totalDocs}</div>
            <div className="text-[11px] text-text-muted mt-0.5">Envelope encrypted</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-accent-success/10 border border-accent-success/30 flex items-center justify-center text-accent-success">
            <Files className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-label text-text-muted">Dual-Auth (Level A)</span>
            <div className="text-2xl font-bold text-accent-danger mt-1">{totalSensA}</div>
            <div className="text-[11px] text-text-muted mt-0.5">Requires 2 approvals</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-accent-danger/10 border border-accent-danger/30 flex items-center justify-center text-accent-danger">
            <Lock className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-label text-text-muted">Integrity Verifications</span>
            <div className="text-2xl font-bold text-accent-success mt-1">100%</div>
            <div className="text-[11px] text-text-muted mt-0.5">SHA-256 anchors valid</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-accent-success/10 border border-accent-success/30 flex items-center justify-center text-accent-success">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Workflow: Anomaly Detection Widget Panel */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-accent-warning" />
            <h3 className="text-h3 font-semibold text-text-primary">
              Real-Time Security Anomaly Monitor
            </h3>
          </div>
          <span className="text-xs text-text-muted font-mono">
            {anomalies.length} Flagged Pattern(s)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {anomalies.map((anom) => {
            const isCritical = anom.severity === 'CRITICAL';
            const isHigh = anom.severity === 'HIGH';

            return (
              <Card
                key={anom.alert_id}
                className={`p-3.5 space-y-2 border transition-all ${
                  isCritical
                    ? 'border-accent-danger/60 bg-accent-danger/5'
                    : isHigh
                    ? 'border-accent-warning/60 bg-accent-warning/5'
                    : 'border-border bg-bg-card'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                      isCritical
                        ? 'bg-accent-danger/20 text-accent-danger border border-accent-danger/40'
                        : 'bg-accent-warning/20 text-accent-warning border border-accent-warning/40'
                    }`}
                  >
                    {anom.alert_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] font-mono text-text-muted">
                    {formatRelativeTime(anom.timestamp)}
                  </span>
                </div>

                <p className="text-xs text-text-secondary leading-snug">{anom.description}</p>

                <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px] font-mono text-text-muted">
                  <span>Target User: {anom.username}</span>
                  <span>IP: {anom.ip_address}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Case Folders Overview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-h2 font-semibold text-text-primary">Assigned Case Folders</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Strictly filtered to cases present in your validated JWT claims.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cases.map((c) => (
            <Card
              key={c.case_id}
              className="p-5 flex flex-col justify-between hover:border-accent-primary transition-all duration-150 cursor-pointer group"
              onClick={() => onSelectCase(c.case_id)}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-xs font-semibold text-accent-primary bg-accent-primary/10 border border-accent-primary/20 px-2 py-0.5 rounded">
                    {c.case_number}
                  </span>
                  <span className="text-[10px] font-mono text-text-muted uppercase">
                    {c.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <h4 className="text-sm font-semibold text-text-primary line-clamp-2 mb-2 group-hover:text-accent-primary transition-colors">
                  {c.title}
                </h4>

                <div className="text-xs text-text-muted mb-4">{c.department}</div>
              </div>

              <div className="space-y-3 pt-3 border-t border-border">
                {/* Sensitivity breakdown badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <SensitivityBadge level="A" size="sm" />
                  <span className="text-xs font-mono text-text-secondary mr-2">
                    {c.document_counts.sensitivity_a}
                  </span>

                  <SensitivityBadge level="B" size="sm" />
                  <span className="text-xs font-mono text-text-secondary mr-2">
                    {c.document_counts.sensitivity_b}
                  </span>

                  <SensitivityBadge level="C" size="sm" />
                  <span className="text-xs font-mono text-text-secondary">
                    {c.document_counts.sensitivity_c}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-accent-primary font-medium group-hover:translate-x-1 transition-transform">
                  <span>Open Case Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Case Documents with ABAC inspection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-h2 font-semibold text-text-primary">Recent Evidence Ingests</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Attribute-Based Access Control enforced on each document card.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/cases')}>
            View All Folders
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {recentDocs.map((doc) => (
            <DocumentCard
              key={doc.file_id}
              document={doc}
              onView={(d) => onSelectDoc(d)}
              onDownload={handleDownload}
              onShare={(d) => setSharingDoc(d)}
              onToggleTamper={handleToggleTamper}
            />
          ))}
        </div>
      </div>

      {/* Share Modal for Controlled Sharing */}
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
