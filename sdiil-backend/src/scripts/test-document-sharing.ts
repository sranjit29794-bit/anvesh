import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const API_BASE = 'http://localhost:8000/api/v1';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

// RFC 6238 TOTP Generator
function generateTOTP(base32Secret: string): string {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < base32Secret.length; i++) {
    const val = base32chars.indexOf(base32Secret.charAt(i).toUpperCase());
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
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;

  return code.toString().padStart(6, '0');
}

async function authenticateDemoUser(email: string, password: string, totpSecret?: string): Promise<{ token: string; userId: string }> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
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

    session = verifyData;
  }

  return { token: session.access_token, userId: session.user.id };
}

async function runSharingTests() {
  console.log('================================================================');
  console.log('SDIIL CONTROLLED DOCUMENT SHARING & DUAL-AUTHORIZATION TESTS');
  console.log('================================================================\n');

  // Step 1: Authenticate all 3 parties (Officer, Supervisor, Judge)
  console.log('[Step 1] Authenticating Demo Users...');
  const officer = await authenticateDemoUser(
    'officer.demo@sdiil.test',
    'Demo@Officer123',
    'XXK4LHEU7K3XEOGWJ6TLIDYLWEWWQEQQ'
  );
  console.log(`✓ Officer authenticated (ID: ${officer.userId})`);

  const supervisor = await authenticateDemoUser(
    'supervisor.demo@sdiil.test',
    'Demo@Supervisor123',
    'IAXTAQNCSNTOPVELUP3B4Y24JONHWALA'
  );
  console.log(`✓ Supervisor authenticated (ID: ${supervisor.userId})`);

  const judge = await authenticateDemoUser(
    'judge.demo@sdiil.test',
    'Demo@Judge123',
    'OA5BNS6MDGW4TN5F4Q7ZV2KW6K5EAR3D'
  );
  console.log(`✓ Judge authenticated (ID: ${judge.userId})`);

  const officerClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${officer.token}` } },
    auth: { persistSession: false },
  });

  // Step 2: Ingest a Sensitivity-A document to test dual-auth
  console.log('\n[Step 2] Officer uploading a Sensitivity-A document (Witness Statement)...');
  const timestamp = Date.now();
  const sensAContent = `%PDF-1.4
% Sensitivity-A Witness Statement for Case MH-PN-2026-0142
% Contains protected confidential identity details
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 64 >> stream
BT /F1 12 Tf 100 700 Td (PROTECTED SENSITIVITY-A: Key Witness Confidential Statement) ET
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
329
%%EOF`;

  const sensABuf = Buffer.from(sensAContent, 'utf-8');
  const sensAForm = new FormData();
  sensAForm.append('file', new Blob([sensABuf], { type: 'application/pdf' }), `Witness_Statement_${timestamp}.pdf`);
  sensAForm.append('case_id', 'MH-PN-2026-0142');
  sensAForm.append('doc_type', 'WitnessStatement');
  sensAForm.append('sensitivity_level', 'A');
  sensAForm.append('title', `Confidential Witness Statement ${timestamp}`);

  const sensAUploadRes = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${officer.token}` },
    body: sensAForm,
  });

  const sensAUploadJson = (await sensAUploadRes.json()) as any;
  if (!sensAUploadRes.ok || !sensAUploadJson.document) {
    throw new Error(`Sensitivity-A upload failed: ${JSON.stringify(sensAUploadJson)}`);
  }
  const sensADoc = sensAUploadJson.document;
  console.log(`✓ Sensitivity-A document created: "${sensADoc.title}" (ID: ${sensADoc.id})`);

  // -------------------------------------------------------------
  // Test 9: Share Sensitivity-A document with Judge -> requires_dual_auth = true, status = pending, Judge BLOCKED
  // -------------------------------------------------------------
  console.log('\n[Test 9] Officer sharing Sensitivity-A document with Judge...');
  const shareRes = await fetch(`${API_BASE}/documents/${sensADoc.id}/share`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${officer.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      shared_with: judge.userId,
      access_duration: 48,
      share_reason: 'Statutory trial scrutiny under Section 161 CrPC',
    }),
  });

  const shareJson = (await shareRes.json()) as any;
  if (!shareRes.ok || !shareJson.sharing_event) {
    throw new Error(`Share request failed (${shareRes.status}): ${JSON.stringify(shareJson)}`);
  }

  const shareEvent = shareJson.sharing_event;
  console.log(`✓ Sharing event created (ID: ${shareEvent.id})`);
  console.log(`  requires_dual_auth: ${shareEvent.requires_dual_auth}`);
  console.log(`  approval_status: ${shareEvent.approval_status}`);
  console.log(`  access_expires_at: ${shareEvent.access_expires_at}`);

  if (!shareEvent.requires_dual_auth || shareEvent.approval_status !== 'pending') {
    throw new Error('Test 9 Failure: Sensitivity-A share must require dual-auth and have pending status!');
  }

  // Judge tries to download the document BEFORE approval
  console.log('  Judge attempting to download Sensitivity-A document while approval is PENDING...');
  const judgeEarlyRes = await fetch(`${API_BASE}/documents/${sensADoc.id}/download`, {
    headers: { Authorization: `Bearer ${judge.token}` },
  });
  console.log(`  Judge HTTP status: ${judgeEarlyRes.status}`);
  if (judgeEarlyRes.status !== 403) {
    throw new Error(`Security breach! Judge was able to access pending Sensitivity-A document (status ${judgeEarlyRes.status})`);
  }
  console.log('✓ Access blocked for Judge as expected while dual-auth approval is pending!');

  // -------------------------------------------------------------
  // Test 10: Supervisor lists pending approvals and approves the request
  // -------------------------------------------------------------
  console.log('\n[Test 10] Supervisor checking pending approvals queue...');
  const queueRes = await fetch(`${API_BASE}/sharing/pending-approvals`, {
    headers: { Authorization: `Bearer ${supervisor.token}` },
  });
  const queueJson = (await queueRes.json()) as any;
  if (!queueRes.ok || !queueJson.approvals) {
    throw new Error(`Failed to fetch pending queue: ${JSON.stringify(queueJson)}`);
  }

  const pendingItem = queueJson.approvals.find((a: any) => a.sharing_event_id === shareEvent.id);
  if (!pendingItem) {
    throw new Error(`Pending approval for event ${shareEvent.id} not found in supervisor queue!`);
  }
  console.log(`✓ Pending share found in supervisor queue for document "${pendingItem.doc_title}"`);
  console.log(`  Initiated by: ${pendingItem.initiator_name} -> Recipient: ${pendingItem.recipient_name}`);

  // Supervisor approves the share
  console.log(`  Supervisor approving share event ${shareEvent.id}...`);
  const approveRes = await fetch(`${API_BASE}/sharing/${shareEvent.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${supervisor.token}` },
  });
  const approveJson = (await approveRes.json()) as any;
  if (!approveRes.ok || !approveJson.sharing_event) {
    throw new Error(`Approval failed (${approveRes.status}): ${JSON.stringify(approveJson)}`);
  }
  console.log(`✓ Share approved by Supervisor: status = "${approveJson.sharing_event.approval_status}"`);

  // -------------------------------------------------------------
  // Test 11: Judge retries download now that it is APPROVED -> SUCCEEDS
  // -------------------------------------------------------------
  console.log('\n[Test 11] Judge retrying download after supervisor approval...');
  const judgeApprovedRes = await fetch(`${API_BASE}/documents/${sensADoc.id}/download`, {
    headers: { Authorization: `Bearer ${judge.token}` },
  });

  const judgeApprovedJson = (await judgeApprovedRes.json()) as any;
  if (!judgeApprovedRes.ok || !judgeApprovedJson.signedUrl) {
    throw new Error(`Judge download failed after approval (${judgeApprovedRes.status}): ${JSON.stringify(judgeApprovedJson)}`);
  }
  console.log(`✓ Judge successfully granted signed URL!`);
  console.log(`  Signed URL: ${judgeApprovedJson.signedUrl.slice(0, 70)}...`);

  // Verify downloaded bytes
  const downloadedBytes = Buffer.from(await (await fetch(judgeApprovedJson.signedUrl)).arrayBuffer());
  const downloadedHash = crypto.createHash('sha256').update(downloadedBytes).digest('hex');
  if (downloadedHash !== judgeApprovedJson.file_hash) {
    throw new Error('Downloaded bytes hash mismatch!');
  }
  console.log(`✓ Judge downloaded ${downloadedBytes.length} bytes; SHA-256 integrity verified!`);

  // -------------------------------------------------------------
  // Test 12: Share a Sensitivity-B document -> immediate approval, no supervisor queue
  // -------------------------------------------------------------
  console.log('\n[Test 12] Officer sharing a Sensitivity-B document (Immediate Grant)...');
  // Upload a Sensitivity-B document
  const sensBForm = new FormData();
  sensBForm.append('file', new Blob([sensABuf], { type: 'application/pdf' }), `Chargesheet_${timestamp}.pdf`);
  sensBForm.append('case_id', 'MH-PN-2026-0142');
  sensBForm.append('doc_type', 'ChargeSheet');
  sensBForm.append('sensitivity_level', 'B');
  sensBForm.append('title', `Police Charge Sheet ${timestamp}`);

  const sensBUploadRes = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${officer.token}` },
    body: sensBForm,
  });
  const sensBUploadJson = (await sensBUploadRes.json()) as any;
  const sensBDoc = sensBUploadJson.document;

  const shareBRes = await fetch(`${API_BASE}/documents/${sensBDoc.id}/share`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${officer.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      shared_with: judge.userId,
      access_duration: 24,
      share_reason: 'Judicial framing of charges',
    }),
  });

  const shareBJson = (await shareBRes.json()) as any;
  console.log(`✓ Sensitivity-B share response:`, {
    requires_dual_auth: shareBJson.requires_dual_auth,
    approval_status: shareBJson.approval_status,
  });

  if (shareBJson.requires_dual_auth !== false || shareBJson.approval_status !== 'approved') {
    throw new Error('Test 12 Failure: Sensitivity-B share must immediately be approved without dual auth!');
  }

  // Judge can download immediately without supervisor action
  const judgeBDl = await fetch(`${API_BASE}/documents/${sensBDoc.id}/download`, {
    headers: { Authorization: `Bearer ${judge.token}` },
  });
  if (!judgeBDl.ok) {
    throw new Error(`Judge immediate download failed for Sensitivity-B document (status ${judgeBDl.status})`);
  }
  console.log('✓ Judge successfully downloaded Sensitivity-B document immediately!');

  // -------------------------------------------------------------
  // Test 13: Expired share enforcement (access_expires_at in past)
  // -------------------------------------------------------------
  console.log('\n[Test 13] Testing Expired Share Enforcement...');
  const supervisorClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${supervisor.token}` } },
    auth: { persistSession: false },
  });

  // Supervisor updates access_expires_at of the Sensitivity-B share to 1 hour in the past
  const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
  const { data: updatedShare, error: expireErr } = await supervisorClient
    .from('sharing_events')
    .update({ access_expires_at: pastDate })
    .eq('id', shareBJson.sharing_event.id)
    .select('*')
    .single();

  if (expireErr || !updatedShare) {
    throw new Error(`Failed to expire sharing event: ${expireErr?.message}`);
  }
  console.log(`✓ Updated sharing event access_expires_at to past: ${updatedShare.access_expires_at}`);

  // Judge attempts to download after expiry
  const judgeExpiredRes = await fetch(`${API_BASE}/documents/${sensBDoc.id}/download`, {
    headers: { Authorization: `Bearer ${judge.token}` },
  });
  console.log(`  Judge HTTP status on expired share: ${judgeExpiredRes.status}`);

  if (judgeExpiredRes.status !== 403) {
    throw new Error(`Security Failure! Expired share was not blocked (got status ${judgeExpiredRes.status})`);
  }
  console.log('✓ Expired share correctly BLOCKED with 403 Forbidden!');

  console.log('\n================================================================');
  console.log('🎉 ALL SHARING TESTS (9, 10, 11, 12, 13) PASSED WITH ZERO ERRORS!');
  console.log('================================================================');
}

runSharingTests().catch((err) => {
  console.error('\n❌ Test Execution Failed:', err);
  process.exit(1);
});
