import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { documentsRouter } from '../routes/documents.js';
import { searchRouter } from '../routes/search.js';
import { summaryRouter } from '../routes/summary.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'sdiil-backend/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const PORT = 8000;
const API_BASE = `http://localhost:${PORT}/api/v1`;
const CASE_NUMBER = 'MH-PN-2026-0142';

// RFC 6238 TOTP computation
function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32[i].toUpperCase());
    if (val === -1) continue;
    value = (value << 5) | idx(alphabet, base32[i].toUpperCase());
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function idx(alphabet: string, char: string): number {
  return alphabet.indexOf(char);
}

function generateTOTP(secret: string, step = 30): string {
  const counter = Math.floor(Date.now() / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;
  return code.toString().padStart(6, '0');
}

async function authenticateDemoUser(
  email: string,
  password: string,
  totpSecret?: string
): Promise<{ token: string; userId: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !authData.session) {
    throw new Error(`Sign in failed for ${email}: ${signInErr?.message}`);
  }

  let session = authData.session;

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpFactor = factors?.totp?.find((f) => f.status === 'verified');

  if (totpFactor && totpSecret) {
    const otpCode = generateTOTP(totpSecret);
    const { data: challengeData, error: chalErr } = await supabase.auth.mfa.challenge({
      factorId: totpFactor.id,
    });
    if (chalErr) throw new Error(`MFA challenge failed: ${chalErr.message}`);

    const { data: verifyData, error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code: otpCode,
    });
    if (verifyErr) throw new Error(`MFA verify failed: ${verifyErr.message}`);

    session = verifyData as any;
  }

  return { token: session.access_token, userId: session.user.id };
}

async function ensureUser(email: string, password: string, role: string, name: string): Promise<string> {
  const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
  const existing = listData?.users.find((u) => u.email === email);

  let userId = existing?.id;
  if (!existing) {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !created.user) {
      throw new Error(`Failed to provision user ${email}: ${error?.message}`);
    }
    userId = created.user.id;
  }

  // Ensure profile exists
  await supabaseAdmin.from('profiles').upsert({
    id: userId,
    name,
    role,
    department: 'Investigation',
    is_locked: false,
    account_status: 'ACTIVE',
  });

  return userId!;
}

async function runAttestationTestSuite() {
  console.log('================================================================');
  console.log('  SDIIL Document Attestation Workflow Test Suite (Tests 43–47)');
  console.log('================================================================\n');

  // Start internal server if not running on port 8000
  let serverInstance: any = null;
  let needCloseServer = false;
  try {
    const healthCheck = await fetch(`http://localhost:${PORT}/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      const app = express();
      app.use(cors());
      app.use(express.json());
      app.use('/api/v1/documents', documentsRouter);
      app.use('/api/v1/search', searchRouter);
      app.use('/api/v1/cases', summaryRouter);
      app.get('/health', (_req, res) => res.json({ status: 'HEALTHY' }));

      serverInstance = await new Promise((resolve) => {
        const s = app.listen(PORT, () => {
          console.log(`✓ Test Express server listening on port ${PORT}`);
          resolve(s);
        });
      });
      needCloseServer = true;
    } else {
      console.log(`✓ Using already running backend server on port ${PORT}`);
    }
  } catch {
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api/v1/documents', documentsRouter);
    app.use('/api/v1/search', searchRouter);
    app.use('/api/v1/cases', summaryRouter);
    app.get('/health', (_req, res) => res.json({ status: 'HEALTHY' }));

    serverInstance = await new Promise((resolve) => {
      const s = app.listen(PORT, () => {
        console.log(`✓ Test Express server listening on port ${PORT}`);
        resolve(s);
      });
    });
    needCloseServer = true;
  }

  // Resolve case UUID
  const { data: caseRow } = await supabaseAdmin
    .from('cases')
    .select('id')
    .eq('case_number', CASE_NUMBER)
    .single();

  if (!caseRow) {
    throw new Error(`Case ${CASE_NUMBER} not found in database.`);
  }
  const caseId = caseRow.id;

  // Provision second officer and prosecutor for testing
  console.log('[Setup] Provisioning Officer 2 and Prosecutor test users...');
  const officer2Id = await ensureUser('officer2.demo@sdiil.test', 'Demo@Officer123', 'OFFICER', 'Sub-Insp. Aarav Sharma');
  const prosecutorId = await ensureUser('prosecutor.demo@sdiil.test', 'Demo@Prosecutor123', 'PROSECUTOR', 'Adv. Meera Sen');

  // Assign officer2 to case MH-PN-2026-0142 if not already assigned
  const { data: existingAssignment } = await supabaseAdmin
    .from('case_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('user_id', officer2Id)
    .maybeSingle();

  if (!existingAssignment) {
    await supabaseAdmin.from('case_assignments').insert({
      id: crypto.randomUUID(),
      case_id: caseId,
      user_id: officer2Id,
      role_in_case: 'investigating_officer',
    });
  }

  // Assign prosecutor to case MH-PN-2026-0142 if not already assigned
  const { data: existingProsecutorAssignment } = await supabaseAdmin
    .from('case_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('user_id', prosecutorId)
    .maybeSingle();

  if (!existingProsecutorAssignment) {
    await supabaseAdmin.from('case_assignments').insert({
      id: crypto.randomUUID(),
      case_id: caseId,
      user_id: prosecutorId,
      role_in_case: 'prosecuting_counsel',
    });
  }

  // Authenticate users
  console.log('[Setup] Authenticating test accounts with Supabase Auth & MFA...');
  const officer1 = await authenticateDemoUser(
    'officer.demo@sdiil.test',
    'Demo@Officer123',
    'XXK4LHEU7K3XEOGWJ6TLIDYLWEWWQEQQ'
  );
  console.log(`✓ Officer 1 (Uploader) authenticated (ID: ${officer1.userId})`);

  const officer2 = await authenticateDemoUser(
    'officer2.demo@sdiil.test',
    'Demo@Officer123'
  );
  console.log(`✓ Officer 2 (Colleague) authenticated (ID: ${officer2.userId})`);

  const supervisor = await authenticateDemoUser(
    'supervisor.demo@sdiil.test',
    'Demo@Supervisor123',
    'IAXTAQNCSNTOPVELUP3B4Y24JONHWALA'
  );
  console.log(`✓ Supervisor authenticated (ID: ${supervisor.userId})`);

  const prosecutor = await authenticateDemoUser(
    'prosecutor.demo@sdiil.test',
    'Demo@Prosecutor123'
  );
  console.log(`✓ Prosecutor authenticated (ID: ${prosecutor.userId})\n`);

  let passedTests = 0;
  let doc1Id = '';
  let doc2Id = '';

  try {
    // --------------------------------------------------------------------------
    // Test 43: Document upload creates PENDING_REVIEW status
    // --------------------------------------------------------------------------
    console.log('--- Test 43: Document upload creates PENDING_REVIEW status ---');

    const timestamp1 = Date.now();
    const pdfContent1 = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj\n4 0 obj << /Length 50 >> stream\nBT /F1 12 Tf 100 700 Td (Initial Investigation Log Entry ${timestamp1}) ET\nendstream endobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n00000000115 00000 n\n00000000214 00000 n\ntrailer << /Size 5 /Root 1 0 R >>\nstartxref\n329\n%%EOF`;
    const form1 = new FormData();
    form1.append('file', new Blob([Buffer.from(pdfContent1, 'utf-8')], { type: 'application/pdf' }), `Investigative_Log_${timestamp1}.pdf`);
    form1.append('case_id', CASE_NUMBER);
    form1.append('doc_type', 'INVESTIGATION_REPORT');
    form1.append('sensitivity_level', 'B');
    form1.append('title', `Investigation Report ${timestamp1}`);

    const uploadRes = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${officer1.token}` },
      body: form1,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Upload failed with HTTP ${uploadRes.status}: ${errText}`);
    }

    const uploadData = await uploadRes.json();
    doc1Id = uploadData.document.id;
    console.log(`Uploaded document ID: ${doc1Id}, status: ${uploadData.document.status}`);

    if (uploadData.document.status !== 'PENDING_REVIEW') {
      throw new Error(`Expected status to be PENDING_REVIEW, got "${uploadData.document.status}"`);
    }

    // Verify status in database
    const { data: dbDoc1 } = await supabaseAdmin
      .from('documents')
      .select('id, status')
      .eq('id', doc1Id)
      .single();

    if (dbDoc1?.status !== 'PENDING_REVIEW') {
      throw new Error(`Database record status mismatch: expected PENDING_REVIEW, got "${dbDoc1?.status}"`);
    }
    console.log('✓ Document status is PENDING_REVIEW');

    // Verify document is NOT returned in GET /documents for another officer on the same case
    const listResOfficer2 = await fetch(`${API_BASE}/documents?case_id=${CASE_NUMBER}`, {
      headers: { Authorization: `Bearer ${officer2.token}` },
    });
    const listDataOfficer2 = await listResOfficer2.json();
    const foundInOfficer2 = (listDataOfficer2.documents || []).some((d: any) => d.id === doc1Id);
    if (foundInOfficer2) {
      throw new Error('PENDING_REVIEW document was improperly returned to another officer on the same case');
    }
    console.log('✓ Document is NOT returned for colleague officer');

    // Verify document IS returned for the uploader officer
    const listResOfficer1 = await fetch(`${API_BASE}/documents?case_id=${CASE_NUMBER}`, {
      headers: { Authorization: `Bearer ${officer1.token}` },
    });
    const listDataOfficer1 = await listResOfficer1.json();
    const foundInOfficer1 = (listDataOfficer1.documents || []).some((d: any) => d.id === doc1Id);
    if (!foundInOfficer1) {
      throw new Error('PENDING_REVIEW document was not returned to its uploader');
    }
    console.log('✓ Document IS returned for uploader officer');

    // Verify document IS returned for supervisor on the case
    const listResSupervisor = await fetch(`${API_BASE}/documents?case_id=${CASE_NUMBER}`, {
      headers: { Authorization: `Bearer ${supervisor.token}` },
    });
    const listDataSupervisor = await listResSupervisor.json();
    const foundInSupervisor = (listDataSupervisor.documents || []).some((d: any) => d.id === doc1Id);
    if (!foundInSupervisor) {
      throw new Error('PENDING_REVIEW document was not returned to supervisor');
    }
    console.log('✓ Document IS returned for supervisor on the case');
    console.log('✓ Test 43 passed!\n');
    passedTests++;

    // --------------------------------------------------------------------------
    // Test 44: Non-supervisor cannot approve
    // --------------------------------------------------------------------------
    console.log('--- Test 44: Non-supervisor cannot approve ---');

    // Attempt POST /approve as Officer -> 403
    const approveOfficerRes = await fetch(`${API_BASE}/documents/${doc1Id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${officer1.token}` },
    });
    console.log(`Officer approve response HTTP: ${approveOfficerRes.status}`);
    if (approveOfficerRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for officer approval attempt, got ${approveOfficerRes.status}`);
    }
    console.log('✓ Officer cannot approve document (403 Forbidden)');

    // Attempt POST /approve as Prosecutor -> 403
    const approveProsecutorRes = await fetch(`${API_BASE}/documents/${doc1Id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${prosecutor.token}` },
    });
    console.log(`Prosecutor approve response HTTP: ${approveProsecutorRes.status}`);
    if (approveProsecutorRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for prosecutor approval attempt, got ${approveProsecutorRes.status}`);
    }
    console.log('✓ Prosecutor cannot approve document (403 Forbidden)');

    // Verify document status remains PENDING_REVIEW
    const { data: dbDocAfterAttempt } = await supabaseAdmin
      .from('documents')
      .select('status, reviewed_by')
      .eq('id', doc1Id)
      .single();

    if (dbDocAfterAttempt?.status !== 'PENDING_REVIEW') {
      throw new Error(`Document status changed unexpectedly to "${dbDocAfterAttempt?.status}"`);
    }
    console.log('✓ Document status remains PENDING_REVIEW');
    console.log('✓ Test 44 passed!\n');
    passedTests++;

    // --------------------------------------------------------------------------
    // Test 45: Supervisor approves document
    // --------------------------------------------------------------------------
    console.log('--- Test 45: Supervisor approves document ---');

    const approveSupervisorRes = await fetch(`${API_BASE}/documents/${doc1Id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisor.token}` },
    });

    if (!approveSupervisorRes.ok) {
      const errText = await approveSupervisorRes.text();
      throw new Error(`Supervisor approve failed with HTTP ${approveSupervisorRes.status}: ${errText}`);
    }

    const approvedData = await approveSupervisorRes.json();
    console.log(`Approve response status: ${approvedData.document.status}, reviewed_by: ${approvedData.document.reviewed_by}`);

    if (approvedData.document.status !== 'ACTIVE') {
      throw new Error(`Expected approved status to be ACTIVE, got "${approvedData.document.status}"`);
    }
    if (approvedData.document.reviewed_by !== supervisor.userId) {
      throw new Error(`Expected reviewed_by to match supervisor user_id, got "${approvedData.document.reviewed_by}"`);
    }
    if (!approvedData.document.reviewed_at) {
      throw new Error('Expected reviewed_at timestamp to be populated');
    }
    console.log('✓ Returns 200 with status = ACTIVE, reviewed_by, and reviewed_at');

    // Verify audit_log has document_approved event
    const { data: auditLogs } = await supabaseAdmin
      .from('audit_log')
      .select('*')
      .eq('resource_id', doc1Id)
      .eq('action', 'document_approved');

    if (!auditLogs || auditLogs.length === 0) {
      throw new Error('No document_approved event found in audit_log');
    }
    console.log(`✓ audit_log contains document_approved event (ID: ${auditLogs[0].id})`);

    // Verify blockchain_events has DOCUMENT_APPROVED event
    const { data: bcEvents } = await supabaseAdmin
      .from('blockchain_events')
      .select('*')
      .eq('doc_id', doc1Id)
      .eq('event_type', 'DOCUMENT_APPROVED');

    if (!bcEvents || bcEvents.length === 0) {
      throw new Error('No DOCUMENT_APPROVED event found in blockchain_events');
    }
    console.log(`✓ blockchain_events contains DOCUMENT_APPROVED event (Tx: ${bcEvents[0].tx_hash})`);

    // Verify document is now returned in GET /documents for the other officer on the case
    const listResOfficer2After = await fetch(`${API_BASE}/documents?case_id=${CASE_NUMBER}`, {
      headers: { Authorization: `Bearer ${officer2.token}` },
    });
    const listDataOfficer2After = await listResOfficer2After.json();
    const foundInOfficer2After = (listDataOfficer2After.documents || []).some((d: any) => d.id === doc1Id);
    if (!foundInOfficer2After) {
      throw new Error('Approved ACTIVE document was NOT returned to colleague officer');
    }
    console.log('✓ Approved document is now returned in GET /documents for other officer');
    console.log('✓ Test 45 passed!\n');
    passedTests++;

    // --------------------------------------------------------------------------
    // Test 46: Supervisor rejects document with reason
    // --------------------------------------------------------------------------
    console.log('--- Test 46: Supervisor rejects document with reason ---');

    // Upload another document as Officer
    const timestamp2 = Date.now();
    const pdfContent2 = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj\n4 0 obj << /Length 50 >> stream\nBT /F1 12 Tf 100 700 Td (Defective Scan Forensic Draft ${timestamp2}) ET\nendstream endobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n00000000115 00000 n\n00000000214 00000 n\ntrailer << /Size 5 /Root 1 0 R >>\nstartxref\n329\n%%EOF`;
    const form2 = new FormData();
    form2.append('file', new Blob([Buffer.from(pdfContent2, 'utf-8')], { type: 'application/pdf' }), `Forensic_Draft_${timestamp2}.pdf`);
    form2.append('case_id', CASE_NUMBER);
    form2.append('doc_type', 'FORENSIC_REPORT');
    form2.append('sensitivity_level', 'B');
    form2.append('title', `Forensic Report Draft ${timestamp2}`);

    const uploadRes2 = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${officer1.token}` },
      body: form2,
    });
    const uploadData2 = await uploadRes2.json();
    doc2Id = uploadData2.document.id;
    console.log(`Uploaded second document ID: ${doc2Id}`);

    // Attempt POST /reject with empty review_note -> 400
    const emptyRejectRes = await fetch(`${API_BASE}/documents/${doc2Id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisor.token}`,
      },
      body: JSON.stringify({ review_note: '' }),
    });
    console.log(`Empty rejection note response HTTP: ${emptyRejectRes.status}`);
    if (emptyRejectRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request for empty rejection note, got ${emptyRejectRes.status}`);
    }
    const emptyRejectData = await emptyRejectRes.json();
    if (!emptyRejectData.error?.includes('rejection reason is required')) {
      throw new Error(`Expected "rejection reason is required", got "${emptyRejectData.error}"`);
    }
    console.log('✓ Empty review_note rejected with 400 ("rejection reason is required")');

    // Call POST /reject with valid review_note as Supervisor
    const rejectionNote = 'Illegible scan, pages 3-4 missing';
    const rejectRes = await fetch(`${API_BASE}/documents/${doc2Id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisor.token}`,
      },
      body: JSON.stringify({ review_note: rejectionNote }),
    });

    if (!rejectRes.ok) {
      const errText = await rejectRes.text();
      throw new Error(`Supervisor reject failed with HTTP ${rejectRes.status}: ${errText}`);
    }

    const rejectedData = await rejectRes.json();
    if (rejectedData.document.status !== 'REJECTED') {
      throw new Error(`Expected status to be REJECTED, got "${rejectedData.document.status}"`);
    }
    if (rejectedData.document.review_note !== rejectionNote) {
      throw new Error(`Expected review_note to match "${rejectionNote}", got "${rejectedData.document.review_note}"`);
    }
    console.log('✓ Returns 200 with status = REJECTED and review_note stored');

    // Verify audit_log has document_rejected event with rejection_reason in metadata
    const { data: rejectAuditLogs } = await supabaseAdmin
      .from('audit_log')
      .select('*')
      .eq('resource_id', doc2Id)
      .eq('action', 'document_rejected');

    if (!rejectAuditLogs || rejectAuditLogs.length === 0) {
      throw new Error('No document_rejected event found in audit_log');
    }
    const auditMeta = rejectAuditLogs[0].metadata;
    if (auditMeta?.rejection_reason !== rejectionNote) {
      throw new Error(`Expected audit metadata rejection_reason to match, got "${auditMeta?.rejection_reason}"`);
    }
    console.log('✓ audit_log has document_rejected event with rejection_reason in metadata');

    // Verify document is NOT returned for other officer in GET /documents
    const listResOfficer2AfterReject = await fetch(`${API_BASE}/documents?case_id=${CASE_NUMBER}`, {
      headers: { Authorization: `Bearer ${officer2.token}` },
    });
    const listDataOfficer2AfterReject = await listResOfficer2AfterReject.json();
    const foundRejectInOfficer2 = (listDataOfficer2AfterReject.documents || []).some((d: any) => d.id === doc2Id);
    if (foundRejectInOfficer2) {
      throw new Error('REJECTED document was improperly returned to another officer on the case');
    }
    console.log('✓ REJECTED document is NOT returned for other officer');

    // Verify document IS returned for uploader with REJECTED status and review_note visible
    const listResOfficer1AfterReject = await fetch(`${API_BASE}/documents?case_id=${CASE_NUMBER}`, {
      headers: { Authorization: `Bearer ${officer1.token}` },
    });
    const listDataOfficer1AfterReject = await listResOfficer1AfterReject.json();
    const foundRejectInOfficer1 = (listDataOfficer1AfterReject.documents || []).find((d: any) => d.id === doc2Id);
    if (!foundRejectInOfficer1) {
      throw new Error('REJECTED document was not returned to its uploader');
    }
    if (foundRejectInOfficer1.status !== 'REJECTED') {
      throw new Error(`Expected uploader document status REJECTED, got "${foundRejectInOfficer1.status}"`);
    }
    if (foundRejectInOfficer1.review_note !== rejectionNote) {
      throw new Error(`Expected uploader document review_note visible, got "${foundRejectInOfficer1.review_note}"`);
    }
    console.log('✓ REJECTED document IS returned for uploader with review_note visible');
    console.log('✓ Test 46 passed!\n');
    passedTests++;

    // --------------------------------------------------------------------------
    // Test 47: Attestation status in Search and Summary
    // --------------------------------------------------------------------------
    console.log('--- Test 47: Attestation status in Search and Summary ---');

    // 1. Verify REJECTED documents never appear in POST /api/v1/search results for any user
    const searchResOfficer = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${officer1.token}`,
      },
      body: JSON.stringify({
        query: 'Defective Scan Forensic Draft',
        case_id: CASE_NUMBER,
      }),
    });
    const searchDataOfficer = await searchResOfficer.json();
    const citedRejectInSearchOfficer = (searchDataOfficer.cited_doc_ids || []).includes(doc2Id);
    if (citedRejectInSearchOfficer) {
      throw new Error('REJECTED document appeared in search results for officer');
    }

    const searchResSupervisor = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisor.token}`,
      },
      body: JSON.stringify({
        query: 'Defective Scan Forensic Draft',
        case_id: CASE_NUMBER,
      }),
    });
    const searchDataSupervisor = await searchResSupervisor.json();
    const citedRejectInSearchSupervisor = (searchDataSupervisor.cited_doc_ids || []).includes(doc2Id);
    if (citedRejectInSearchSupervisor) {
      throw new Error('REJECTED document appeared in search results for supervisor');
    }
    console.log('✓ REJECTED document never appears in search results for any user');

    // 2. Upload a third doc as PENDING_REVIEW to test search visibility separation
    const timestamp3 = Date.now();
    const pdfContent3 = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj\n4 0 obj << /Length 55 >> stream\nBT /F1 12 Tf 100 700 Td (Pending Secret Clue Unverified ${timestamp3}) ET\nendstream endobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n00000000115 00000 n\n00000000214 00000 n\ntrailer << /Size 5 /Root 1 0 R >>\nstartxref\n329\n%%EOF`;
    const form3 = new FormData();
    form3.append('file', new Blob([Buffer.from(pdfContent3, 'utf-8')], { type: 'application/pdf' }), `Pending_Clue_${timestamp3}.pdf`);
    form3.append('case_id', CASE_NUMBER);
    form3.append('doc_type', 'INVESTIGATION_REPORT');
    form3.append('sensitivity_level', 'B');
    form3.append('title', `Pending Clue Report ${timestamp3}`);

    const uploadRes3 = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${officer1.token}` },
      body: form3,
    });
    const uploadData3 = await uploadRes3.json();
    const doc3Id = uploadData3.document.id;

    // Colleague officer searches: PENDING_REVIEW doc of other officer should NOT be cited
    const searchResColleague = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${officer2.token}`,
      },
      body: JSON.stringify({
        query: 'Pending Secret Clue Unverified',
        case_id: CASE_NUMBER,
      }),
    });
    const searchDataColleague = await searchResColleague.json();
    const citedPendingInColleague = (searchDataColleague.cited_doc_ids || []).includes(doc3Id);
    if (citedPendingInColleague) {
      throw new Error('PENDING_REVIEW document appeared in search results for another officer');
    }
    console.log('✓ PENDING_REVIEW document does not appear in search results for users other than uploader/supervisor');

    // 3. Verify case summary excludes REJECTED document chunks
    const summaryRes = await fetch(`${API_BASE}/cases/${CASE_NUMBER}/summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisor.token}`,
      },
    });

    if (!summaryRes.ok) {
      const errText = await summaryRes.text();
      throw new Error(`Summary generation failed with HTTP ${summaryRes.status}: ${errText}`);
    }

    const summaryData = await summaryRes.json();
    const citedDocsInSummary = summaryData.cited_doc_ids || [];
    if (citedDocsInSummary.includes(doc2Id)) {
      throw new Error('REJECTED document chunk was included in case summary cited_doc_ids');
    }
    console.log('✓ Case summary strictly excludes REJECTED document chunks');
    console.log('✓ Test 47 passed!\n');
    passedTests++;

    console.log('================================================================');
    console.log(`  ALL ${passedTests}/5 ATTESTATION TESTS PASSED SUCCESSFULLY!`);
    console.log('================================================================');
  } finally {
    if (needCloseServer && serverInstance) {
      serverInstance.close();
      console.log('✓ Closed ephemeral test Express server');
    }
  }
}

runAttestationTestSuite().catch((err) => {
  console.error('\n❌ Attestation Test Suite Error:', err);
  process.exit(1);
});
