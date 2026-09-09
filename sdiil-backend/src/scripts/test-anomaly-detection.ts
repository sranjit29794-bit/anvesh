import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { anomalyService } from '../services/anomalyService.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_BASE_URL = 'http://localhost:8000/api/v1';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required Supabase environment variables');
  process.exit(1);
}

// RFC 6238 TOTP Generator
function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function generateTOTP(secret: string, timeStepSec = 30): string {
  const key = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStepSec);

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

async function runAnomalyTests() {
  console.log('================================================================');
  console.log('  SDIIL Phase 10: Anomaly Detection Test Suite (Tests 32-36)');
  console.log('================================================================\n');

  console.log('Authenticating demo users...');
  const officer = await authenticateDemoUser(
    'officer.demo@sdiil.test',
    'Demo@Officer123',
    'XXK4LHEU7K3XEOGWJ6TLIDYLWEWWQEQQ'
  );
  console.log(`✓ Officer authenticated (ID: ${officer.userId})`);

  const judge = await authenticateDemoUser(
    'judge.demo@sdiil.test',
    'Demo@Judge123',
    'OA5BNS6MDGW4TN5F4Q7ZV2KW6K5EAR3D'
  );
  console.log(`✓ Judge authenticated (ID: ${judge.userId})`);

  const admin = await authenticateDemoUser(
    'admin.demo@sdiil.test',
    'Demo@Admin123',
    'CBMDMYG5WT7W2GQXWOUXNG7MECH3LBIE'
  );
  console.log(`✓ Admin authenticated (ID: ${admin.userId})`);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Resolve case UUIDs
  const { data: case0198 } = await adminClient
    .from('cases')
    .select('id, case_number')
    .eq('case_number', 'MH-PN-2026-0198')
    .single();

  const { data: case0142 } = await adminClient
    .from('cases')
    .select('id, case_number')
    .eq('case_number', 'MH-PN-2026-0142')
    .single();

  const caseId0198 = case0198?.id || '';
  const caseId0142 = case0142?.id || '';

  console.log(`✓ Resolved cases: 0198=${caseId0198}, 0142=${caseId0142}`);

  // --------------------------------------------------------------------------
  // TEST 32: GET /api/v1/anomalies without JWT returns 401
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 32: Anonymous Request Rejected with 401 (rule-no-anonymous-access) ---');
  const resAnonymous = await fetch(`${API_BASE_URL}/anomalies`, {
    headers: { 'Content-Type': 'application/json' },
  });

  console.log(`HTTP Status: ${resAnonymous.status} (Expected: 401)`);
  if (resAnonymous.status !== 401) {
    throw new Error(`Test 32 Failed: Expected 401 Unauthorized, got ${resAnonymous.status}`);
  }
  const noAuthJson: any = await resAnonymous.json();
  console.log(`Response error: "${noAuthJson.error}"`);
  console.log('✓ TEST 32 PASSED: Anonymous access to anomalies strictly blocked with 401.\n');

  // Resolve sample document UUIDs
  const { data: sampleDocs0198 } = await adminClient
    .from('documents')
    .select('id')
    .eq('case_id', caseId0198)
    .limit(1);
  const sampleDocId0198 = sampleDocs0198?.[0]?.id;

  const { data: sampleDocs0142 } = await adminClient
    .from('documents')
    .select('id')
    .eq('case_id', caseId0142)
    .limit(1);
  const sampleDocId0142 = sampleDocs0142?.[0]?.id;

  // --------------------------------------------------------------------------
  // TEST 33: Simulate 6 rapid download audit entries for officer on case MH-PN-2026-0198
  // Confirm BULK_DOWNLOAD HIGH row exists
  // --------------------------------------------------------------------------
  console.log('--- TEST 33: Simulate 6 Rapid Downloads -> BULK_DOWNLOAD (HIGH) ---');
  console.log(`Inserting 6 download audit entries for officer on case ${caseId0198}...`);

  for (let i = 1; i <= 6; i++) {
    const { error: insErr } = await adminClient.from('audit_log').insert({
      user_id: officer.userId,
      action: 'download',
      resource_type: 'document',
      resource_id: sampleDocId0198 || null,
      case_id: caseId0198,
      ip_address: '127.0.0.1',
      metadata: {
        test_run: true,
        download_index: i,
        sensitivity_level: 'B',
      },
    });
    if (insErr) throw new Error(`Failed to insert test audit log: ${insErr.message}`);
  }

  // Trigger evaluation
  await anomalyService.evaluateAnomalies(officer.userId, 'download', caseId0198, { test_run: true });

  // Query anomaly_flags directly
  const { data: bulkAnomalies, error: bulkErr } = await adminClient
    .from('anomaly_flags')
    .select('*')
    .eq('user_id', officer.userId)
    .eq('rule_triggered', 'BULK_DOWNLOAD')
    .eq('severity', 'HIGH')
    .eq('case_id', caseId0198)
    .order('triggered_at', { ascending: false });

  if (bulkErr || !bulkAnomalies || bulkAnomalies.length === 0) {
    throw new Error(`Test 33 Failed: Expected BULK_DOWNLOAD HIGH row in anomaly_flags, got ${bulkAnomalies?.length || 0}`);
  }

  console.log(`✓ Found BULK_DOWNLOAD anomaly row:`);
  console.log(`  Rule: ${bulkAnomalies[0].rule_triggered}`);
  console.log(`  Severity: ${bulkAnomalies[0].severity}`);
  console.log(`  Description: "${bulkAnomalies[0].description}"`);
  console.log(`  Case ID: ${bulkAnomalies[0].case_id}`);
  console.log('✓ TEST 33 PASSED: BULK_DOWNLOAD rule accurately evaluated and registered as HIGH severity.\n');

  // --------------------------------------------------------------------------
  // TEST 34: Simulate 3 failed access entries in audit_log for officer -> FAILED_ACCESS_ATTEMPT (HIGH)
  // --------------------------------------------------------------------------
  console.log('--- TEST 34: Simulate 3 Failed Access Entries -> FAILED_ACCESS_ATTEMPT (HIGH) ---');
  console.log('Inserting 3 access_denied audit entries for officer...');

  for (let i = 1; i <= 3; i++) {
    const { error: insErr } = await adminClient.from('audit_log').insert({
      user_id: officer.userId,
      action: 'access_denied',
      resource_type: 'document',
      resource_id: sampleDocId0142 || null,
      case_id: caseId0142,
      ip_address: '127.0.0.1',
      metadata: {
        test_run: true,
        attempt: i,
        reason: 'unauthorized_probe',
      },
    });
    if (insErr) throw new Error(`Failed to insert test audit log: ${insErr.message}`);
  }

  // Trigger evaluation
  await anomalyService.evaluateAnomalies(officer.userId, 'access_denied', caseId0142, { test_run: true });

  const { data: failedAnomalies, error: failedErr } = await adminClient
    .from('anomaly_flags')
    .select('*')
    .eq('user_id', officer.userId)
    .eq('rule_triggered', 'FAILED_ACCESS_ATTEMPT')
    .eq('severity', 'HIGH')
    .order('triggered_at', { ascending: false });

  if (failedErr || !failedAnomalies || failedAnomalies.length === 0) {
    throw new Error(`Test 34 Failed: Expected FAILED_ACCESS_ATTEMPT HIGH row in anomaly_flags`);
  }

  console.log(`✓ Found FAILED_ACCESS_ATTEMPT anomaly row:`);
  console.log(`  Rule: ${failedAnomalies[0].rule_triggered}`);
  console.log(`  Severity: ${failedAnomalies[0].severity}`);
  console.log(`  Description: "${failedAnomalies[0].description}"`);
  console.log('✓ TEST 34 PASSED: FAILED_ACCESS_ATTEMPT accurately flagged and stored as HIGH severity.\n');

  // --------------------------------------------------------------------------
  // TEST 35: Judge queries GET /api/v1/anomalies -> only assigned cases (zero unassigned rows)
  // --------------------------------------------------------------------------
  console.log('--- TEST 35: Judge Queries Anomalies (Case Scoping via RLS) ---');
  console.log(`Note: Judge is assigned strictly to case MH-PN-2026-0198 (${caseId0198}).`);
  console.log(`Unassigned case is MH-PN-2026-0142 (${caseId0142}).`);

  // Ensure there is at least one anomaly on unassigned case 0142
  await adminClient.from('anomaly_flags').insert({
    case_id: caseId0142,
    user_id: officer.userId,
    rule_triggered: 'BULK_DOWNLOAD',
    severity: 'HIGH',
    description: `Test anomaly strictly belonging to unassigned case ${caseId0142}`,
    acknowledged: false,
  });

  const resJudge = await fetch(`${API_BASE_URL}/anomalies`, {
    headers: {
      Authorization: `Bearer ${judge.token}`,
    },
  });

  console.log(`HTTP Status: ${resJudge.status} (Expected: 200)`);
  if (resJudge.status !== 200) {
    const txt = await resJudge.text();
    throw new Error(`Test 35 Failed: Expected 200 OK for judge, got ${resJudge.status}: ${txt}`);
  }

  const judgeAnomaliesData: any = await resJudge.json();
  const judgeList: any[] = judgeAnomaliesData.anomalies || [];
  console.log(`Judge retrieved ${judgeList.length} anomaly rows.`);

  // Verify none of the judge's rows belong to case 0142
  const leakedRow = judgeList.find((r) => r.case_id === caseId0142 || r.case_id === 'MH-PN-2026-0142');
  if (leakedRow) {
    throw new Error(`Test 35 Failed: Data leakage! Judge received anomaly for unassigned case 0142: ${JSON.stringify(leakedRow)}`);
  }

  console.log(`✓ Confirmed: 0 rows from unassigned case MH-PN-2026-0142 visible to judge.`);
  console.log('✓ TEST 35 PASSED: Strict RLS case-scoping on anomaly_flags confirmed. Zero leakage.\n');

  // --------------------------------------------------------------------------
  // TEST 36: ADMIN calls PATCH /api/v1/anomalies/:id/acknowledge
  // Row updated with acknowledged = true and acknowledged_by = admin user_id
  // --------------------------------------------------------------------------
  console.log('--- TEST 36: ADMIN Acknowledges Anomaly via PATCH Endpoint ---');
  const targetAnomalyId = bulkAnomalies[0].id;
  console.log(`Target anomaly ID to acknowledge: ${targetAnomalyId}`);

  const resAck = await fetch(`${API_BASE_URL}/anomalies/${targetAnomalyId}/acknowledge`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`,
    },
  });

  console.log(`HTTP Status: ${resAck.status} (Expected: 200)`);
  if (resAck.status !== 200) {
    const errText = await resAck.text();
    throw new Error(`Test 36 Failed: Expected 200 OK, got ${resAck.status}: ${errText}`);
  }

  const ackData: any = await resAck.json();
  console.log(`Acknowledge response message: "${ackData.message}"`);
  console.log(`Updated anomaly: acknowledged=${ackData.anomaly?.acknowledged}, by=${ackData.anomaly?.acknowledged_by}`);

  if (ackData.anomaly?.acknowledged !== true) {
    throw new Error(`Test 36 Failed: Expected acknowledged = true`);
  }

  if (ackData.anomaly?.acknowledged_by !== admin.userId) {
    throw new Error(`Test 36 Failed: Expected acknowledged_by = ${admin.userId}, got ${ackData.anomaly?.acknowledged_by}`);
  }

  // Also verify audit log has anomaly_acknowledged action
  const { data: ackAudit } = await adminClient
    .from('audit_log')
    .select('*')
    .eq('action', 'anomaly_acknowledged')
    .eq('resource_id', targetAnomalyId)
    .limit(1);

  if (!ackAudit || ackAudit.length === 0) {
    throw new Error('Test 36 Failed: audit_log entry for anomaly_acknowledged not found');
  }

  console.log(`✓ Audit log verified: Action = ${ackAudit[0].action}, Resource ID = ${ackAudit[0].resource_id}`);
  console.log('✓ TEST 36 PASSED: Anomaly acknowledged successfully by ADMIN role with audit trail.\n');

  console.log('================================================================');
  console.log('🎉 ALL 5 ANOMALY DETECTION TESTS (32, 33, 34, 35, 36) PASSED!');
  console.log('================================================================');
}

runAnomalyTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
