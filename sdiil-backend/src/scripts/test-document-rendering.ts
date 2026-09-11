import crypto from 'crypto';
import fs from 'fs';
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

function generateTOTP(secret: string): string {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < secret.length; i++) {
    const val = base32chars.indexOf(secret.charAt(i).toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  const key = Buffer.from(bytes);
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = 30;
  const counter = Math.floor(epoch / timeStep);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;
  return code.toString().padStart(6, '0');
}

async function authenticateDemoUser(email: string, password: string, totpSecret?: string): Promise<{ token: string; userId: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr || !authData.session) {
    throw new Error(`Sign in failed for ${email}: ${signInErr?.message}`);
  }

  let session = authData.session;
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpFactor = factors?.totp?.find((f) => f.status === 'verified');

  let secret = totpSecret;
  if (!secret) {
    try {
      const candidates = [
        path.resolve(process.cwd(), 'sdiil-frontend/src/config/demoMfaSecrets.json'),
        path.resolve(__dirname, '../../../sdiil-frontend/src/config/demoMfaSecrets.json'),
        path.resolve(__dirname, '../../../../sdiil-frontend/src/config/demoMfaSecrets.json'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const json = JSON.parse(fs.readFileSync(p, 'utf8'));
          secret = json[email.toLowerCase()]?.secret;
          if (secret) break;
        }
      }
    } catch {
      // ignore
    }
  }

  if (totpFactor && secret) {
    const otpCode = generateTOTP(secret);
    const { data: challengeData, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
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
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !created.user) throw new Error(`Failed to provision user ${email}: ${error?.message}`);
    userId = created.user.id;
  }

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

async function runRenderingTestSuite() {
  console.log('================================================================');
  console.log('  SDIIL Document Rendering & Access Test Suite (Tests 48-50)');
  console.log('================================================================\n');

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

  const { data: caseRow } = await supabaseAdmin.from('cases').select('id').eq('case_number', CASE_NUMBER).single();
  if (!caseRow) throw new Error(`Case ${CASE_NUMBER} not found in database.`);
  const caseId = caseRow.id;

  console.log('[Setup] Provisioning test users...');
  const judgeId = await ensureUser('judge.demo@sdiil.test', 'Demo@Judge123', 'judge', 'Hon. Justice Rajesh Verma');
  console.log(`✓ Judge user ready (ID: ${judgeId})`);

  const officer = await authenticateDemoUser('officer.demo@sdiil.test', 'Demo@Officer123');
  console.log(`✓ Officer authenticated (ID: ${officer.userId})`);

  const judge = await authenticateDemoUser('judge.demo@sdiil.test', 'Demo@Judge123');
  console.log(`✓ Judge authenticated (ID: ${judge.userId})`);

  const { data: existingJudgeAssignment } = await supabaseAdmin
    .from('case_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('user_id', judgeId)
    .maybeSingle();

  if (existingJudgeAssignment) {
    await supabaseAdmin.from('case_assignments').delete().eq('id', existingJudgeAssignment.id);
    console.log('✓ Removed judge from case assignments to ensure unassigned status');
  }

  let passedTests = 0;
  let docId = '';

  try {
    // --------------------------------------------------------------------------
    // Test 48: Officer can view uploaded document via GET /:id/view
    // --------------------------------------------------------------------------
    console.log('--- Test 48: Officer can view uploaded document via GET /:id/view ---');

    const timestamp = Date.now();
    const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 55 >> stream
BT /F1 12 Tf 100 700 Td (Rendering Test Document ${timestamp}) ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
320
%%EOF`;

    const form = new FormData();
    form.append('file', new Blob([Buffer.from(pdfContent, 'utf-8')], { type: 'application/pdf' }), `Rendering_Test_${timestamp}.pdf`);
    form.append('case_id', CASE_NUMBER);
    form.append('doc_type', 'INVESTIGATION_REPORT');
    form.append('sensitivity_level', 'B');
    form.append('title', `Rendering Test Document ${timestamp}`);

    const uploadRes = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${officer.token}` },
      body: form,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Upload failed with HTTP ${uploadRes.status}: ${errText}`);
    }

    const uploadData = await uploadRes.json();
    docId = uploadData.document.id;
    console.log(`✓ Uploaded document ID: ${docId}`);

    const supervisor = await authenticateDemoUser('supervisor.demo@sdiil.test', 'Demo@Supervisor123');

    const approveRes = await fetch(`${API_BASE}/documents/${docId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisor.token}` },
    });
    if (!approveRes.ok) throw new Error(`Failed to approve document: ${approveRes.status}`);
    console.log(`✓ Document approved for viewing`);

    const viewRes = await fetch(`${API_BASE}/documents/${docId}/view`, {
      headers: { Authorization: `Bearer ${officer.token}` },
    });

    console.log(`View endpoint response HTTP: ${viewRes.status}`);
    if (viewRes.status !== 200) {
      const errText = await viewRes.text();
      throw new Error(`Expected 200 for view endpoint, got ${viewRes.status}: ${errText}`);
    }

    const viewData = await viewRes.json();
    const hasSignedUrl = Boolean(viewData.url || viewData.signedUrl);
    const contentType = viewRes.headers.get('Content-Type');

    if (!hasSignedUrl && !contentType?.includes('application/pdf')) {
      throw new Error(`View response must contain a signed URL or Content-Type application/pdf. Got: ${JSON.stringify({ url: viewData.url, signedUrl: viewData.signedUrl, contentType })}`);
    }
    console.log(`✓ View endpoint returned valid response (signedUrl present or Content-Type: ${contentType})`);

    const { data: viewAuditLogs } = await supabaseAdmin
      .from('audit_log')
      .select('*')
      .eq('resource_id', docId)
      .eq('action', 'document_viewed')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!viewAuditLogs || viewAuditLogs.length === 0) {
      throw new Error('No document_viewed audit event found after calling view endpoint');
    }
    console.log(`✓ audit_log contains document_viewed event (ID: ${viewAuditLogs[0].id})`);
    console.log('✓ Test 48 passed!\n');
    passedTests++;

    // --------------------------------------------------------------------------
    // Test 49: Unassigned judge cannot view document via GET /:id/view
    // --------------------------------------------------------------------------
    console.log('--- Test 49: Unassigned judge cannot view document via GET /:id/view ---');

    const judgeViewRes = await fetch(`${API_BASE}/documents/${docId}/view`, {
      headers: { Authorization: `Bearer ${judge.token}` },
    });

    console.log(`Judge view response HTTP: ${judgeViewRes.status}`);
    if (judgeViewRes.status !== 403) {
      const errText = await judgeViewRes.text();
      throw new Error(`Expected 403 Forbidden for unassigned judge, got ${judgeViewRes.status}: ${errText}`);
    }
    console.log('✓ Unassigned judge received 403 Forbidden');

    const { data: judgeViewAuditLogs } = await supabaseAdmin
      .from('audit_log')
      .select('*')
      .eq('resource_id', docId)
      .eq('action', 'document_viewed')
      .eq('user_id', judge.userId);

    if (judgeViewAuditLogs && judgeViewAuditLogs.length > 0) {
      throw new Error('document_viewed audit event should NOT exist for denied judge access');
    }
    console.log('✓ No document_viewed audit event for denied judge access');
    console.log('✓ Test 49 passed!\n');
    passedTests++;

    // --------------------------------------------------------------------------
    // Test 50: Download endpoint writes 'download' audit action (not 'document_viewed')
    // --------------------------------------------------------------------------
    console.log('--- Test 50: Download endpoint writes download audit action ---');

    const downloadRes = await fetch(`${API_BASE}/documents/${docId}/download`, {
      headers: { Authorization: `Bearer ${officer.token}` },
    });

    console.log(`Download endpoint response HTTP: ${downloadRes.status}`);
    if (downloadRes.status !== 200) {
      const errText = await downloadRes.text();
      throw new Error(`Expected 200 for download endpoint, got ${downloadRes.status}: ${errText}`);
    }

    const downloadContentType = downloadRes.headers.get('Content-Type');
    if (!downloadContentType?.includes('application/pdf')) {
      throw new Error(`Expected Content-Type application/pdf for download, got: ${downloadContentType}`);
    }
    console.log(`✓ Download endpoint returned Content-Type: ${downloadContentType}`);

    const downloadBuffer = Buffer.from(await downloadRes.arrayBuffer());
    if (downloadBuffer.length === 0) {
      throw new Error('Download response body is empty');
    }
    console.log(`✓ Download endpoint returned ${downloadBuffer.length} bytes`);

    const { data: downloadAuditLogs } = await supabaseAdmin
      .from('audit_log')
      .select('*')
      .eq('resource_id', docId)
      .eq('action', 'download')
      .eq('user_id', officer.userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!downloadAuditLogs || downloadAuditLogs.length === 0) {
      throw new Error('No download audit event found after calling download endpoint');
    }
    console.log(`✓ audit_log contains download event (ID: ${downloadAuditLogs[0].id})`);

    const { data: viewAuditAfterDownload } = await supabaseAdmin
      .from('audit_log')
      .select('*')
      .eq('resource_id', docId)
      .eq('user_id', officer.userId)
      .eq('action', 'document_viewed')
      .gt('created_at', downloadAuditLogs[0].created_at);

    if (viewAuditAfterDownload && viewAuditAfterDownload.length > 0) {
      throw new Error('document_viewed audit event should not be created after download');
    }
    console.log('✓ No spurious document_viewed event after download');
    console.log('✓ Test 50 passed!\n');
    passedTests++;

    console.log('================================================================');
    console.log(`  ALL ${passedTests}/3 RENDERING TESTS PASSED SUCCESSFULLY!`);
    console.log('================================================================');
  } finally {
    if (needCloseServer && serverInstance) {
      serverInstance.close();
      console.log('✓ Closed ephemeral test Express server');
    }
  }
}

runRenderingTestSuite().catch((err) => {
  console.error('\n❌ Rendering Test Suite Error:', err);
  process.exit(1);
});
