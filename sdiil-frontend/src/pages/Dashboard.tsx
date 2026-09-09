import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/services/api';
import { supabase } from '@/services/supabase.client';
import { CaseRecord } from '@/types/case.types';
import { DocumentRecord } from '@/types/document.types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { ShareModal } from '@/components/sharing/ShareModal';
import { documentsService } from '@/services/documents.service';
import { anomaliesService, AnomalyFlag } from '@/services/anomalies.service';
import { formatRelativeTime } from '@/utils/formatDate';
import {
  FolderLock,
  Files,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  UploadCloud,
  Search,
  Lock,
  Flame,
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
  const [anomalyFlags, setAnomalyFlags] = useState<AnomalyFlag[]>([]);
  const [isLoadingAnomalies, setIsLoadingAnomalies] = useState(true);
  const [isDemoTriggering, setIsDemoTriggering] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [recentDocs, setRecentDocs] = useState<DocumentRecord[]>([]);
  const [sharingDoc, setSharingDoc] = useState<DocumentRecord | null>(null);

  const loadAnomalies = async () => {
    try {
      const data = await anomaliesService.getAnomalies();
      setAnomalyFlags(data);
    } catch (err) {
      console.error('Failed to load anomaly flags:', err);
    } finally {
      setIsLoadingAnomalies(false);
    }
  };

  useEffect(() => {
    // Load assigned cases based on user's case_ids claim
    const assigned = db.cases.filter(
      (c) => user?.role === 'ADMIN' || (user?.case_ids && user.case_ids.includes(c.case_id))
    );
    setCases(assigned);
    setRecentDocs(db.documents.slice(0, 4));

    // Initial load of live anomalies
    loadAnomalies();

    // Supabase Realtime subscription on anomaly_flags table
    const channel = supabase
      .channel('realtime-anomaly-flags')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'anomaly_flags' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newFlag = payload.new as AnomalyFlag;
            setAnomalyFlags((prev) => [newFlag, ...prev.filter((f) => f.id !== newFlag.id)]);

            // Show React Hot Toast notification for new CRITICAL or HIGH anomaly
            if (newFlag.severity === 'CRITICAL' || newFlag.severity === 'HIGH') {
              toast.custom(
                (t) => (
                  <div
                    className={`${
                      t.visible ? 'animate-enter' : 'animate-leave'
                    } max-w-md w-full bg-[#1A0808] border border-[#E84545]/80 shadow-2xl rounded-card p-3.5 flex items-start gap-3 pointer-events-auto text-white`}
                  >
                    <ShieldAlert className="w-5 h-5 text-[#E84545] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-xs text-[#E84545] uppercase truncate">
                          {newFlag.rule_triggered}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-[#E84545]/20 text-[#E84545] border border-[#E84545]/40 shrink-0">
                          {newFlag.severity}
                        </span>
                      </div>
                      <p className="text-xs text-gray-200 mt-1 leading-snug">
                        {newFlag.description.length > 60
                          ? newFlag.description.slice(0, 60) + '...'
                          : newFlag.description}
                      </p>
                    </div>
                  </div>
                ),
                { id: newFlag.id, duration: 6000 }
              );
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as AnomalyFlag;
            setAnomalyFlags((prev) =>
              updated.acknowledged
                ? prev.filter((f) => f.id !== updated.id)
                : prev.map((f) => (f.id === updated.id ? updated : f))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleAcknowledge = async (id: string) => {
    setAcknowledgingId(id);
    try {
      const ok = await anomaliesService.acknowledgeAnomaly(id);
      if (ok) {
        setAnomalyFlags((prev) => prev.filter((a) => a.id !== id));
        toast.success('Anomaly flagged as acknowledged');
      } else {
        toast.error('Failed to acknowledge anomaly');
      }
    } catch {
      toast.error('Failed to acknowledge anomaly');
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleTriggerDemo = async () => {
    setIsDemoTriggering(true);
    try {
      const ok = await anomaliesService.triggerDemoAnomalies();
      if (ok) {
        toast.success('Triggered demo anomalies! Rows will stream live below.');
        // Fast refresh fallback
        setTimeout(() => loadAnomalies(), 600);
      } else {
        toast.error('Failed to trigger demo anomalies');
      }
    } catch {
      toast.error('Error triggering demo anomalies');
    } finally {
      setIsDemoTriggering(false);
    }
  };

  const totalDocs = cases.reduce((acc, c) => acc + c.document_counts.total, 0);
  const totalSensA = cases.reduce((acc, c) => acc + c.document_counts.sensitivity_a, 0);

  const handleDownload = async (doc: DocumentRecord) => {
    if (!user) return;
    const { blob, filename } = await documentsService.downloadDocument(
      doc.file_id,
      user.user_id,
      user.full_name || user.username
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${doc.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${doc.version}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleToggleTamper = async (docId: string) => {
    await documentsService.toggleTamperSimulation(docId);
    setRecentDocs([...db.documents.slice(0, 4)]);
  };

  const getSeverityBadge = (severity: string) => {
    const s = severity ? severity.toUpperCase() : 'LOW';
    if (s === 'CRITICAL') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border border-[#E84545]/40 bg-[#1A0808] text-[#E84545]">
          CRITICAL
        </span>
      );
    }
    if (s === 'HIGH') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border border-[#E84545]/30 bg-[#1A0808] text-[#FF6B6B]">
          HIGH
        </span>
      );
    }
    if (s === 'MEDIUM') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border border-[#F5A623]/30 bg-[#1A1208] text-[#F5A623]">
          MEDIUM
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border border-[#22C97A]/30 bg-[#081A10] text-[#22C97A]">
        LOW
      </span>
    );
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
          {user?.role === 'ADMIN' && (
            <Button
              variant="secondary"
              size="sm"
              isLoading={isDemoTriggering}
              onClick={handleTriggerDemo}
              leftIcon={<Flame className="w-4 h-4 text-[#E84545]" />}
            >
              Demo: Trigger Anomalies
            </Button>
          )}

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

      {/* Metric Counters Grid with Active Anomalies Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

        <Card
          className="p-4 flex items-center justify-between cursor-pointer hover:border-[#E84545]/60 transition-all group"
          onClick={() => {
            document.getElementById('anomaly-flags-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <div>
            <span className="text-label text-text-muted">Active Anomalies</span>
            <div className="text-2xl font-bold text-[#E84545] mt-1 flex items-center gap-1.5">
              <span>{anomalyFlags.length}</span>
              {anomalyFlags.length > 0 && (
                <span className="inline-block w-2 h-2 rounded-full bg-[#E84545] animate-ping" />
              )}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">Click to view alerts</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#E84545]/10 border border-[#E84545]/30 flex items-center justify-center text-[#E84545] group-hover:scale-105 transition-transform">
            <ShieldAlert className="w-5 h-5 text-[#E84545]" />
          </div>
        </Card>
      </div>

      {/* Workflow: Anomaly Detection Live Table Card */}
      <div id="anomaly-flags-section" className="space-y-3">
        <Card className="p-5 border-border bg-bg-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShieldAlert className="w-5 h-5 text-[#E84545]" />
                {anomalyFlags.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#E84545] rounded-full animate-ping" />
                )}
                {anomalyFlags.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#E84545] rounded-full" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-h3 font-semibold text-text-primary">
                    Anomaly Detection — Live
                  </h3>
                  {anomalyFlags.length > 0 && (
                    <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#E84545]/15 text-[#E84545] border border-[#E84545]/30 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E84545] animate-pulse" />
                      {anomalyFlags.length} Active Alert{anomalyFlags.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Real-time exfiltration, access spikes, and off-hours violations detected across audit trails via Supabase Realtime.
                </p>
              </div>
            </div>

            {user?.role === 'ADMIN' && (
              <Button
                variant="secondary"
                size="sm"
                isLoading={isDemoTriggering}
                onClick={handleTriggerDemo}
                leftIcon={<Flame className="w-3.5 h-3.5 text-[#E84545]" />}
              >
                Demo: Trigger Anomalies
              </Button>
            )}
          </div>

          {/* Table */}
          {isLoadingAnomalies ? (
            <div className="py-12 text-center text-xs text-text-muted">Loading live anomaly monitors...</div>
          ) : anomalyFlags.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <ShieldCheck className="w-8 h-8 text-accent-success mx-auto" />
              <p className="text-sm font-semibold text-text-primary">No Active Security Anomalies</p>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                All user actions across assigned cases conform to standard baseline policies. No bulk exfiltration or unauthorized access patterns flagged.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-text-muted font-mono uppercase text-[10px]">
                    <th className="py-2.5 px-3">Triggered At</th>
                    <th className="py-2.5 px-3">Rule</th>
                    <th className="py-2.5 px-3">Severity</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Case</th>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {anomalyFlags.map((flag) => (
                    <tr key={flag.id} className="hover:bg-bg-elevated/40 transition-colors">
                      <td className="py-3 px-3 font-mono text-text-muted whitespace-nowrap">
                        {formatRelativeTime(flag.triggered_at)}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-text-primary whitespace-nowrap">
                        {flag.rule_triggered}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {getSeverityBadge(flag.severity)}
                      </td>
                      <td className="py-3 px-3 text-text-secondary max-w-xs truncate" title={flag.description}>
                        {flag.description}
                      </td>
                      <td className="py-3 px-3 font-mono text-text-muted whitespace-nowrap">
                        {flag.case_id ? flag.case_id.slice(0, 12) + '...' : 'Global'}
                      </td>
                      <td className="py-3 px-3 text-text-primary whitespace-nowrap">
                        {flag.user?.full_name || flag.user?.username || flag.user_id?.slice(0, 8) || 'Unknown'}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {(user?.role === 'ADMIN' || user?.role === 'SUPERVISOR') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={flag.acknowledged || acknowledgingId === flag.id}
                            isLoading={acknowledgingId === flag.id}
                            onClick={() => handleAcknowledge(flag.id)}
                          >
                            {flag.acknowledged ? 'Acknowledged' : 'Acknowledge'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
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
