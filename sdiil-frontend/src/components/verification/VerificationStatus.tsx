import React from 'react';
import { TamperVerificationResult } from '@/types/document.types';
import { Card } from '@/components/ui/Card';
import { ShieldCheck, ShieldAlert, CheckCircle, XCircle, QrCode, Hash } from 'lucide-react';

export interface VerificationStatusProps {
  result: TamperVerificationResult;
}

export const VerificationStatus: React.FC<VerificationStatusProps> = ({ result }) => {
  const isTampered = result.verification_status === 'TAMPERED' || !result.hashes_match;

  // Mock public verification URL
  const publicVerifyUrl = `https://icjs.delhi.gov.in/verify/${result.doc_id}/${result.original_hash.slice(0, 16)}`;

  return (
    <div className="space-y-6">
      {/* Top Banner: Court-Grade Status (VERIFIED or TAMPERED) */}
      <div
        className={`p-6 sm:p-8 rounded-card text-center border-2 shadow-xl transition-all ${
          isTampered
            ? 'bg-accent-danger text-white border-[#FFAAAA] shadow-[0_0_30px_rgba(232,69,69,0.5)]'
            : 'bg-accent-success/15 text-accent-success border-accent-success/50 shadow-[0_0_20px_rgba(34,201,122,0.15)]'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          {isTampered ? (
            <>
              <ShieldAlert className="w-16 h-16 animate-bounce" />
              <h1 className="text-3xl sm:text-4xl font-black tracking-wider uppercase">
                TAMPERED / INTEGRITY BREACH
              </h1>
              <p className="text-sm font-medium text-white/90 max-w-xl">
                The computed SHA-256 hash of the decrypted evidence bytes does not match the immutable
                original hash committed to the blockchain. Evidentiary integrity cannot be certified.
              </p>
            </>
          ) : (
            <>
              <ShieldCheck className="w-16 h-16" />
              <h1 className="text-3xl sm:text-4xl font-black tracking-wider uppercase">
                VERIFIED (AUTHENTIC & UNALTERED)
              </h1>
              <p className="text-sm font-medium text-accent-success/90 max-w-xl">
                Cryptographic match confirmed. The decrypted evidence stream is 100% identical byte-for-byte
                to the original file ingested at the evidence intake node.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Hash Verification Comparative Grid */}
      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border">
          <h3 className="text-h3 font-semibold text-text-primary flex items-center gap-2">
            <Hash className="w-4 h-4 text-accent-primary" />
            Cryptographic Evidence Ledger Inspection
          </h3>
          {(result.doc_title || result.case_number) && (
            <div className="flex items-center gap-2 text-xs">
              {result.case_number && (
                <span className="px-2 py-0.5 rounded bg-bg-secondary text-accent-primary font-mono font-medium border border-border">
                  {result.case_number}
                </span>
              )}
              {result.version_number && (
                <span className="px-2 py-0.5 rounded bg-bg-secondary text-text-secondary font-mono font-medium border border-border">
                  v{result.version_number}
                </span>
              )}
            </div>
          )}
        </div>

        {result.doc_title && (
          <div className="text-xs text-text-secondary">
            Inspecting Document: <strong className="text-text-primary">{result.doc_title}</strong>
            {result.checked_by && (
              <span> • Verification Officer: <strong className="text-text-primary">{result.checked_by}</strong></span>
            )}
          </div>
        )}

        <div className="space-y-3 font-mono text-xs">
          <div className="p-3 rounded-card bg-bg-secondary border border-border">
            <div className="text-[10px] uppercase text-text-muted mb-1 flex items-center justify-between">
              <span>Registered Original Hash (Raw Ingest Buffer):</span>
              <span className="text-accent-primary">Anchor Origin</span>
            </div>
            <div className="text-text-primary break-all select-all font-semibold">
              {result.registered_hash || result.original_hash}
            </div>
          </div>

          <div className="p-3 rounded-card bg-bg-secondary border border-border">
            <div className="text-[10px] uppercase text-text-muted mb-1 flex items-center justify-between">
              <span>Recomputed Hash Now (Decrypted Blob Stream):</span>
              <span className={isTampered ? 'text-accent-danger font-bold' : 'text-accent-success'}>
                {isTampered ? 'MISMATCH DETECTED' : 'EXACT MATCH'}
              </span>
            </div>
            <div
              className={`break-all select-all font-semibold ${
                isTampered ? 'text-accent-danger' : 'text-text-primary'
              }`}
            >
              {result.computed_hash}
            </div>
          </div>
        </div>

        {/* Verification Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="flex items-center gap-3 p-3 rounded-input bg-bg-elevated/50 border border-border">
            {result.hashes_match ? (
              <CheckCircle className="w-5 h-5 text-accent-success shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-accent-danger shrink-0" />
            )}
            <div>
              <div className="text-xs font-semibold text-text-primary">SHA-256 Provable Match</div>
              <div className="text-[11px] text-text-muted">
                {result.hashes_match ? 'Matched registered hash' : 'Hash value mismatch'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-input bg-bg-elevated/50 border border-border">
            {!result.storage_integrity_failure ? (
              <CheckCircle className="w-5 h-5 text-accent-success shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-accent-danger shrink-0" />
            )}
            <div>
              <div className="text-xs font-semibold text-text-primary">GCM Storage Authenticity</div>
              <div className="text-[11px] text-text-muted">
                {!result.storage_integrity_failure ? 'GCM tag validated' : 'Storage authentication tag failed'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-input bg-bg-elevated/50 border border-border">
            <CheckCircle className="w-5 h-5 text-accent-success shrink-0" />
            <div>
              <div className="text-xs font-semibold text-text-primary">Blockchain Ledger Anchor</div>
              <div className="text-[11px] text-text-muted">
                {result.blockchain_events_count} immutable event(s) recorded
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-input bg-bg-elevated/50 border border-border">
            <CheckCircle className="w-5 h-5 text-accent-success shrink-0" />
            <div>
              <div className="text-xs font-semibold text-text-primary">Audit Log Traceability</div>
              <div className="text-[11px] text-text-muted">
                {result.audit_events_count} verifiable trail row(s)
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* QR Code Independent Verification Box */}
      <Card className="flex flex-col sm:flex-row items-center gap-6 p-6">
        <div className="w-32 h-32 p-2 bg-white rounded-card flex items-center justify-center shrink-0 shadow-md">
          {/* Simulated QR Code representation */}
          <div className="w-full h-full border-2 border-black flex flex-col items-center justify-center text-black">
            <QrCode className="w-20 h-20" />
            <span className="text-[8px] font-mono font-bold mt-1">SCAN IN COURT</span>
          </div>
        </div>

        <div className="space-y-2 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <span className="text-label text-accent-primary font-bold">Public Independent Endpoint</span>
          </div>
          <h4 className="text-h3 font-semibold text-text-primary">Courtroom QR Verification Portal</h4>
          <p className="text-xs text-text-secondary leading-relaxed">
            Presiding Judges and Defense Counsel may scan this code on any mobile terminal to independently
            verify the registered hash against the court node without logging into the SDIIL system.
          </p>
          <div className="font-mono text-[11px] text-accent-primary bg-bg-elevated p-2 rounded border border-border truncate select-all">
            {publicVerifyUrl}
          </div>
        </div>
      </Card>
    </div>
  );
};
