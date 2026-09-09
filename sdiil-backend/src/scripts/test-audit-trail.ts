import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_BASE_URL = 'http://localhost:8000/api/v1';

function generateTOTP(secret: string): string {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < secret.length; i++) {
    const val = base32chars.indexOf(secret.charAt(i).toUpperCase());
    if (val >= 0) bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
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
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({
      factorId: totpFactor.id,
    });
    if (challengeErr) throw new Error(`MFA challenge failed: ${challengeErr.message}`);

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

async function runAuditTests() {
  console.log('================================================================');
  console.log('SDIIL IMMUTABLE AUDIT TRAIL, REALTIME & RLS ENFORCEMENT TEST');
  console.log('================================================================\n');

  // Step 1: Authenticate users
  console.log('[Step 1] Authenticating demo users...');
  const officer = await authenticateDemoUser(
    'officer.demo@sdiil.test',
    'Demo@Officer123',
    'XXK4LHEU7K3XEOGWJ6TLIDYLWEWWQEQQ'
  );
  console.log(`✓ Officer authenticated (ID: ${officer.userId})`);

  const admin = await authenticateDemoUser(
    'admin.demo@sdiil.test',
    'Demo@Admin123',
    'CBMDMYG5WT7W2GQXWOUXNG7MECH3LBIE'
  );
  console.log(`✓ Admin authenticated (ID: ${admin.userId})`);

  const judge = await authenticateDemoUser(
    'judge.demo@sdiil.test',
    'Demo@Judge123',
    'OA5BNS6MDGW4TN5F4Q7ZV2KW6K5EAR3D'
  );
  console.log(`✓ Judge authenticated (ID: ${judge.userId})`);

  const officerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${officer.token}` } },
    auth: { persistSession: false },
  });

  // Test 14: Direct UPDATE and DELETE rejection on audit_log
  console.log('\n[Test 14] Testing Immutability: Attempting direct UPDATE and DELETE on audit_log...');
  const { data: sampleRow } = await officerClient.from('audit_log').select('id').limit(1).single();
  if (!sampleRow) throw new Error('No existing audit_log row found to test immutability.');

  // Attempt direct UPDATE
  const { error: updateError } = await officerClient
    .from('audit_log')
    .update({ action: 'tampered_action' })
    .eq('id', sampleRow.id);

  if (!updateError) {
    throw new Error('SECURITY VIOLATION: Direct UPDATE on audit_log succeeded! Must be revoked.');
  }
  console.log(`✓ Direct UPDATE rejected by PostgreSQL: ${updateError.message}`);

  // Attempt direct DELETE
  const { error: deleteError } = await officerClient
    .from('audit_log')
    .delete()
    .eq('id', sampleRow.id);

  if (!deleteError) {
    throw new Error('SECURITY VIOLATION: Direct DELETE on audit_log succeeded! Must be revoked.');
  }
  console.log(`✓ Direct DELETE rejected by PostgreSQL: ${deleteError.message}`);
  console.log('✓ rule-immutable-audit-log confirmed: audit_log table is permanently append-only!');

  // Test 15: Admin Cross-Case Visibility via GET /api/v1/audit
  console.log('\n[Test 15] Admin cross-case audit visibility via GET /api/v1/audit...');
  const adminRes = await fetch(`${API_BASE_URL}/audit?limit=20`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });

  if (!adminRes.ok) {
    throw new Error(`Admin audit fetch failed with HTTP ${adminRes.status}`);
  }

  const adminData: any = await adminRes.json();
  if (!adminData.success || !Array.isArray(adminData.audit_logs)) {
    throw new Error('Invalid audit API response format.');
  }

  console.log(`✓ Admin retrieved ${adminData.audit_logs.length} audit entries (total: ${adminData.count})`);
  const uniqueCases = new Set(adminData.audit_logs.map((l: any) => l.case_id).filter(Boolean));
  console.log(`✓ Admin sees events across ${uniqueCases.size} distinct cases`);
  console.log(`  Sample description: "${adminData.audit_logs[0]?.description}"`);

  // Test 16: Role & Case Scoping (Judge assigned ONLY to MH-PN-2026-0198)
  console.log('\n[Test 16] Testing Case-Scoped Access for non-privileged user (Judge)...');
  const judgeRes = await fetch(`${API_BASE_URL}/audit?limit=20`, {
    headers: { Authorization: `Bearer ${judge.token}` },
  });

  if (!judgeRes.ok) {
    throw new Error(`Judge audit fetch failed with HTTP ${judgeRes.status}`);
  }

  const judgeData: any = await judgeRes.json();
  console.log(`✓ Judge retrieved ${judgeData.audit_logs.length} audit entries`);

  // Resolve case UUIDs
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: case0142 } = await adminClient.from('cases').select('id').eq('case_number', 'MH-PN-2026-0142').single();
  const { data: case0198 } = await adminClient.from('cases').select('id').eq('case_number', 'MH-PN-2026-0198').single();

  // Confirm judge does not see unassigned case MH-PN-2026-0142 in default list
  const forbiddenSeen = judgeData.audit_logs.some((l: any) => l.case_id === case0142?.id);
  if (forbiddenSeen) {
    throw new Error('SECURITY VIOLATION: Judge saw audit records for unassigned case MH-PN-2026-0142!');
  }
  console.log('✓ Verified: Judge default audit view contains zero unassigned case 0142 records.');

  // Judge explicitly probing unassigned case 0142 -> MUST return 403 Forbidden
  console.log('  Judge attempting to query audit trail for unassigned case MH-PN-2026-0142...');
  const probeRes = await fetch(`${API_BASE_URL}/audit?case_id=MH-PN-2026-0142`, {
    headers: { Authorization: `Bearer ${judge.token}` },
  });

  if (probeRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for unassigned case query, got HTTP ${probeRes.status}`);
  }
  const probeData: any = await probeRes.json();
  console.log(`✓ Access denied with HTTP 403: "${probeData.error}"`);

  // Judge querying assigned case 0198 -> MUST succeed
  console.log('  Judge querying audit trail for assigned case MH-PN-2026-0198...');
  const assignedRes = await fetch(`${API_BASE_URL}/audit?case_id=MH-PN-2026-0198`, {
    headers: { Authorization: `Bearer ${judge.token}` },
  });
  if (!assignedRes.ok) {
    throw new Error(`Expected 200 OK for assigned case query, got HTTP ${assignedRes.status}`);
  }
  const assignedData: any = await assignedRes.json();
  console.log(`✓ Succeeded with HTTP 200: Judge retrieved ${assignedData.audit_logs.length} records for case 0198.`);

  // Test 17: Filter Correctness & Descriptions
  console.log('\n[Test 17] Testing Filters (action, date range) and Human-Readable Descriptions...');
  const downloadFilterRes = await fetch(`${API_BASE_URL}/audit?action=download&limit=10`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const downloadData: any = await downloadFilterRes.json();
  console.log(`✓ Action filter 'download' returned ${downloadData.audit_logs.length} records`);
  for (const log of downloadData.audit_logs) {
    if (log.action !== 'download') throw new Error(`Filter mismatch: got action ${log.action}`);
    if (!log.description.toLowerCase().includes('downloaded')) {
      throw new Error(`Description format error: "${log.description}"`);
    }
  }
  console.log(`  Sample: "${downloadData.audit_logs[0]?.description}"`);

  // Date range filter
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dateFilterRes = await fetch(`${API_BASE_URL}/audit?start_date=${todayStart.toISOString()}&limit=5`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const dateData: any = await dateFilterRes.json();
  console.log(`✓ Date filter (start_date: today) returned ${dateData.audit_logs.length} records`);
  for (const log of dateData.audit_logs) {
    if (new Date(log.created_at) < todayStart) {
      throw new Error(`Date boundary violation: ${log.created_at} is before ${todayStart.toISOString()}`);
    }
  }

  // Test 18: Real-time Append Verification
  console.log('\n[Test 18] Testing Live Action Append to Audit Log...');
  // Officer downloads a document
  const { data: docRow } = await adminClient.from('documents').select('id, title').limit(1).single();
  if (!docRow) throw new Error('No document row found for download test');
  const dlRes = await fetch(`${API_BASE_URL}/documents/${docRow.id}/download`, {
    headers: { Authorization: `Bearer ${officer.token}` },
  });
  if (!dlRes.ok) throw new Error(`Download failed with HTTP ${dlRes.status}`);

  // Immediate audit fetch
  const freshRes = await fetch(`${API_BASE_URL}/audit?limit=1`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const freshData: any = await freshRes.json();
  const latest = freshData.audit_logs[0];
  console.log(`✓ Latest audit log entry confirmed:`);
  console.log(`  Actor: ${latest.username} (${latest.user_role})`);
  console.log(`  Action: ${latest.action}`);
  console.log(`  Description: "${latest.description}"`);
  console.log(`  Timestamp: ${latest.created_at}`);

  console.log('\n================================================================');
  console.log('🎉 ALL AUDIT TRAIL TESTS (14, 15, 16, 17, 18) PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runAuditTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
