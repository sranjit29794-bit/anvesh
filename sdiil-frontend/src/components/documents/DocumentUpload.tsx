import React, { useState } from 'react';
import { DocType } from '@/types/document.types';
import { useDocuments } from '@/hooks/useDocuments';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { UploadCloud, FileCheck, CheckCircle2, Lock } from 'lucide-react';

export interface DocumentUploadComponentProps {
  caseId: string;
  onSuccess?: () => void;
}

export const DocumentUpload: React.FC<DocumentUploadComponentProps> = ({ caseId, onSuccess }) => {
  const { user } = useAuth();
  const { uploadDocument, checkUploadPermission } = useDocuments(caseId);

  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocType>('INVESTIGATION_REPORT');
  const [pipelineStep, setPipelineStep] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    file_id: string;
    doc_type: DocType;
    sensitivity_level: 'A' | 'B' | 'C';
    original_hash: string;
    classification_confidence: number;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadPerm = checkUploadPermission(docType);

  const isForensicOfficer = user?.role === 'FORENSIC_OFFICER';

  const docTypes: DocType[] = [
    'FIR',
    'WITNESS_STATEMENT',
    'CHARGE_SHEET',
    'FORENSIC_REPORT',
    'COURT_FILING',
    'INVESTIGATION_REPORT',
    'LEGAL_NOTICE',
    'OTHER',
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadResult(null);
      setError(null);
    }
  };

  const handleStartUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    if (!uploadPerm.allowed) {
      setError(uploadPerm.reason || 'Upload not permitted');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Step simulation matching workflow-document-ingest
      setPipelineStep('Step 1/6: Validating MIME and File Size (<50MB)...');
      await new Promise((r) => setTimeout(r, 250));

      setPipelineStep('Step 2/6: Extracting OCR Text via Tesseract (eng+hin)...');
      await new Promise((r) => setTimeout(r, 350));

      setPipelineStep('Step 3/6: Executing AI Classification & Entity Tagging...');
      await new Promise((r) => setTimeout(r, 300));

      setPipelineStep('Step 4/6: Computing SHA-256 on Raw Bytes & Generating RSA Signature...');
      await new Promise((r) => setTimeout(r, 250));

      setPipelineStep('Step 5/6: Envelope Encrypting DEK with AES-256-GCM & MinIO Put Object...');
      await new Promise((r) => setTimeout(r, 300));

      setPipelineStep('Step 6/6: Registering Blockchain Event & ABAC pgvector Chunks...');
      const res = await uploadDocument(file, docType);

      setUploadResult({
        file_id: res.file_id,
        doc_type: res.doc_type,
        sensitivity_level: res.sensitivity_level,
        original_hash: res.original_hash,
        classification_confidence: res.classification_confidence,
      });

      setFile(null);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload ingest pipeline failed');
    } finally {
      setIsProcessing(false);
      setPipelineStep(null);
    }
  };

  if (!uploadPerm.allowed) {
    return (
      <Card className="text-center py-10">
        <div className="w-12 h-12 mx-auto rounded-full bg-accent-danger/10 border border-accent-danger/30 flex items-center justify-center text-accent-danger mb-3">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-h3 font-semibold text-text-primary mb-1">Ingest Disabled</h3>
        <p className="text-sm text-text-muted max-w-md mx-auto">{uploadPerm.reason}</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-6">
      <div>
        <h3 className="text-h2 font-semibold text-text-primary">Evidence Document Ingest Pipeline</h3>
        <p className="text-xs text-text-secondary mt-1">
          Cryptographic hashing on raw bytes, envelope AES-256-GCM encryption, OCR text extraction,
          and immutable blockchain registration.
        </p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <form onSubmit={handleStartUpload} className="space-y-4">
        {/* Document Type Selector */}
        <div>
          <label className="text-label text-text-secondary font-medium block mb-1.5">
            Initial Classification Tag
          </label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
            disabled={isForensicOfficer}
            className="w-full bg-bg-elevated text-text-primary border border-border rounded-input text-body p-2 outline-none focus:border-accent-primary"
          >
            {docTypes.map((t) => (
              <option key={t} value={t} disabled={isForensicOfficer && t !== 'FORENSIC_REPORT'}>
                {t} {isForensicOfficer && t !== 'FORENSIC_REPORT' ? '(Restricted for Forensic Officer)' : ''}
              </option>
            ))}
          </select>
          {isForensicOfficer && (
            <span className="text-[11px] text-accent-warning mt-1 block">
              Forensic Officers are restricted strictly to FORENSIC_REPORT uploads.
            </span>
          )}
        </div>

        {/* File Drop Area */}
        <div className="border-2 border-dashed border-border-strong rounded-card p-6 text-center hover:border-accent-primary transition-colors bg-bg-elevated/30">
          <input
            type="file"
            id="evidence-file-input"
            onChange={handleFileChange}
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.tiff,.docx,.txt"
            disabled={isProcessing}
          />
          <label
            htmlFor="evidence-file-input"
            className="cursor-pointer flex flex-col items-center justify-center gap-2"
          >
            <div className="w-12 h-12 rounded-full bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-text-primary">
              {file ? file.name : 'Click to select evidence file or drag and drop'}
            </div>
            <div className="text-xs text-text-muted">
              PDF, TIFF, PNG, JPEG, DOCX up to 50MB (Raw bytes are hashed before encryption)
            </div>
          </label>
        </div>

        {/* Ingest Progress status */}
        {isProcessing && (
          <div className="p-3.5 rounded-card bg-bg-secondary border border-border space-y-2">
            <div className="flex items-center justify-between text-xs text-text-primary font-medium">
              <span>{pipelineStep}</span>
              <span className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="w-full bg-bg-elevated h-1.5 rounded-full overflow-hidden">
              <div className="bg-accent-primary h-full rounded-full animate-pulse w-3/4" />
            </div>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={!file || isProcessing}
          isLoading={isProcessing}
          className="w-full"
          leftIcon={<FileCheck className="w-4 h-4" />}
        >
          {isProcessing ? 'Ingesting Evidence...' : 'Ingest & Encrypt Document'}
        </Button>
      </form>

      {/* Upload Confirmation & AI Classification Banner */}
      {uploadResult && (
        <div className="pt-4 border-t border-border space-y-4">
          <Alert variant="ai-verification" title="Human Verification Required (ICJS Rule)">
            AI-generated document classification and metadata extraction requires human verification
            before any legal or investigative use.
          </Alert>

          <div className="p-4 rounded-card bg-bg-secondary border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-accent-success font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Evidence Successfully Ingested (ID: {uploadResult.file_id})
              </div>
              <SensitivityBadge level={uploadResult.sensitivity_level} showDetails />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-text-muted">Classified Type:</span>
                <span className="ml-1.5 font-semibold text-text-primary">{uploadResult.doc_type}</span>
                <span className="ml-1 text-text-muted font-mono">
                  ({(uploadResult.classification_confidence * 100).toFixed(0)}% conf)
                </span>
              </div>
              <div>
                <span className="text-text-muted">Sensitivity Tier:</span>
                <span className="ml-1.5 font-semibold text-text-primary">
                  Level {uploadResult.sensitivity_level}
                </span>
              </div>
            </div>

            <div className="font-mono text-[11px] text-text-secondary bg-bg-primary p-2 rounded border border-border">
              <span className="text-text-muted block text-[10px] uppercase">Registered SHA-256:</span>
              <span className="select-all break-all">{uploadResult.original_hash}</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
