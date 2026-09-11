import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatIST(dateInput: string | Date | number): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return (
      d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }) + ' IST'
    );
  } catch {
    return String(dateInput);
  }
}

/**
 * Public independent verification endpoint.
 * GET /verify/:docId/:hash
 *
 * Requirements:
 * - Requires NO authentication (public endpoint)
 * - Queries documents table for doc_id
 * - Compares the hash parameter against original_hash in documents/blockchain
 * - Returns HTML card for mobile/court terminal inspection
 */
export async function verifyPublicHandler(req: Request, res: Response) {
  const { docId, hash } = req.params;

  if (!docId || !hash) {
    return res.status(400).send(renderNotFoundHtml('Unknown', 'Unknown'));
  }

  try {
    // 1. Query documents table
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, case_id, title, created_at, current_version_id')
      .eq('id', docId)
      .maybeSingle();

    if (docError || !doc) {
      return res.status(404).send(renderNotFoundHtml(docId, hash));
    }

    // 2. Query document_versions & blockchain_events to retrieve the registered original_hash
    let versionQuery = supabaseAdmin.from('document_versions').select('id, file_hash');
    if (doc.current_version_id) {
      versionQuery = versionQuery.eq('id', doc.current_version_id);
    } else {
      versionQuery = versionQuery.eq('document_id', docId).order('version_number', { ascending: false }).limit(1);
    }

    const { data: ver } = await versionQuery.maybeSingle();

    let originalHash = '';
    if (ver) {
      const { data: bcEvent } = await supabaseAdmin
        .from('blockchain_events')
        .select('registered_hash')
        .eq('document_version_id', ver.id)
        .eq('event_type', 'hash_registered')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      originalHash = bcEvent?.registered_hash || ver.file_hash || '';
    }

    if (!originalHash) {
      return res.status(404).send(renderNotFoundHtml(docId, hash));
    }

    // 3. Compare hash parameter against original_hash
    const normalizedParamHash = hash.trim().toLowerCase();
    const normalizedOriginalHash = originalHash.trim().toLowerCase();
    const isVerified = normalizedParamHash === normalizedOriginalHash;

    const currentTimestampIst = formatIST(new Date());
    const registeredAtIst = formatIST(doc.created_at);

    if (isVerified) {
      return res.status(200).send(
        renderVerifiedHtml({
          docId,
          originalHash,
          currentTimestampIst,
          registeredAtIst,
        })
      );
    } else {
      return res.status(200).send(
        renderTamperedHtml({
          docId,
          originalHash,
          currentTimestampIst,
          registeredAtIst,
        })
      );
    }
  } catch (err: any) {
    console.error('[Public Verify] Error:', err);
    return res.status(500).send(renderNotFoundHtml(docId, hash));
  }
}

function renderVerifiedHtml({
  docId,
  originalHash,
  currentTimestampIst,
  registeredAtIst,
}: {
  docId: string;
  originalHash: string;
  currentTimestampIst: string;
  registeredAtIst: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SDIIL Document Verification</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      background: #0A0A0F; 
      color: #F0F0F5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #16161F;
      border: 1px solid #22C97A;
      border-radius: 12px;
      padding: 32px;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .status { 
      font-size: 28px; 
      font-weight: 700; 
      color: #22C97A;
      margin-bottom: 8px;
    }
    .label { 
      font-size: 11px; 
      color: #9090A8; 
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-top: 16px;
    }
    .value { 
      font-size: 13px; 
      color: #F0F0F5;
      font-family: monospace;
      word-break: break-all;
      margin-top: 4px;
    }
    .disclaimer {
      font-size: 11px;
      color: #55556A;
      margin-top: 24px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:48px">✅</div>
    <div class="status">DOCUMENT VERIFIED</div>
    <p style="color:#9090A8;font-size:13px">
      This document has not been tampered with 
      since registration.
    </p>
    <div class="label">Document ID</div>
    <div class="value">${escapeHtml(docId)}</div>
    <div class="label">Registered Hash (SHA-256)</div>
    <div class="value">${escapeHtml(originalHash)}</div>
    <div class="label">Verified At</div>
    <div class="value">${escapeHtml(currentTimestampIst)}</div>
    <div class="label">Registered At</div>
    <div class="value">${escapeHtml(registeredAtIst)}</div>
    <div class="disclaimer">
      Verified by SDIIL — Sensitive Document 
      Intelligence and Integrity Layer.<br>
      This verification confirms document integrity 
      since registration only. It does not 
      constitute legal proof of document 
      truthfulness or evidentiary validity.<br>
      Human verification required for legal use.
    </div>
  </div>
</body>
</html>`;
}

function renderTamperedHtml({
  docId,
  originalHash,
  currentTimestampIst,
  registeredAtIst,
}: {
  docId: string;
  originalHash: string;
  currentTimestampIst: string;
  registeredAtIst: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SDIIL Document Verification</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      background: #0A0A0F; 
      color: #F0F0F5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #16161F;
      border: 1px solid #E84545;
      border-radius: 12px;
      padding: 32px;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .status { 
      font-size: 28px; 
      font-weight: 700; 
      color: #E84545;
      margin-bottom: 8px;
    }
    .label { 
      font-size: 11px; 
      color: #9090A8; 
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-top: 16px;
    }
    .value { 
      font-size: 13px; 
      color: #F0F0F5;
      font-family: monospace;
      word-break: break-all;
      margin-top: 4px;
    }
    .disclaimer {
      font-size: 11px;
      color: #55556A;
      margin-top: 24px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:48px">❌</div>
    <div class="status">TAMPERING DETECTED</div>
    <p style="color:#E84545;font-size:13px;line-height:1.5;">
      This document has been modified after registration.<br>
      The hash does not match the registered value.<br>
      Do not use this document in legal proceedings 
      without investigation.
    </p>
    <div class="label">Document ID</div>
    <div class="value">${escapeHtml(docId)}</div>
    <div class="label">Registered Hash (SHA-256)</div>
    <div class="value">${escapeHtml(originalHash)}</div>
    <div class="label">Verified At</div>
    <div class="value">${escapeHtml(currentTimestampIst)}</div>
    <div class="label">Registered At</div>
    <div class="value">${escapeHtml(registeredAtIst)}</div>
    <div class="disclaimer">
      Verified by SDIIL — Sensitive Document 
      Intelligence and Integrity Layer.<br>
      This verification confirms document integrity 
      since registration only. It does not 
      constitute legal proof of document 
      truthfulness or evidentiary validity.<br>
      Human verification required for legal use.
    </div>
  </div>
</body>
</html>`;
}

function renderNotFoundHtml(docId: string, hash: string): string {
  const currentTimestampIst = formatIST(new Date());
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SDIIL Document Verification</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      background: #0A0A0F; 
      color: #F0F0F5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #16161F;
      border: 1px solid #F5A623;
      border-radius: 12px;
      padding: 32px;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .status { 
      font-size: 28px; 
      font-weight: 700; 
      color: #F5A623;
      margin-bottom: 8px;
    }
    .label { 
      font-size: 11px; 
      color: #9090A8; 
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-top: 16px;
    }
    .value { 
      font-size: 13px; 
      color: #F0F0F5;
      font-family: monospace;
      word-break: break-all;
      margin-top: 4px;
    }
    .disclaimer {
      font-size: 11px;
      color: #55556A;
      margin-top: 24px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:48px">⚠️</div>
    <div class="status">DOCUMENT NOT FOUND</div>
    <p style="color:#9090A8;font-size:13px">
      No document matching the provided identifier was found in the vault.
    </p>
    <div class="label">Document ID</div>
    <div class="value">${escapeHtml(docId)}</div>
    <div class="label">Provided Hash</div>
    <div class="value">${escapeHtml(hash)}</div>
    <div class="label">Checked At</div>
    <div class="value">${escapeHtml(currentTimestampIst)}</div>
    <div class="disclaimer">
      Verified by SDIIL — Sensitive Document 
      Intelligence and Integrity Layer.<br>
      This verification confirms document integrity 
      since registration only. It does not 
      constitute legal proof of document 
      truthfulness or evidentiary validity.<br>
      Human verification required for legal use.
    </div>
  </div>
</body>
</html>`;
}
