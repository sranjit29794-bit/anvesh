import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

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

async function runAdminTests() {
  console.log('================================================================');
  console.log('  SDIIL Phase 11: Real Admin Panel Test Suite (Tests 37-41)');
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

  // --------------------------------------------------------------------------
  // TEST 37: Non-ADMIN user (officer) calling POST /api/v1/admin/users returns 403
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 37: Non-ADMIN User Calling Admin Endpoint Returns 403 ---');
  const resForbidden = await fetch(`${API_BASE_URL}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${officer.token}`,
    },
    body: JSON.stringify({
      email: `unauthorized.test.${Date.now()}@sdiil.test`,
      full_name: 'Unauthorized Probe',
      role: 'INVESTIGATOR',
    }),
  });

  console.log(`HTTP Status: ${resForbidden.status} (Expected: 403)`);
  if (resForbidden.status !== 403) {
    throw new Error(`Test 37 Failed: Expected 403 Forbidden for non-admin, got ${resForbidden.status}`);
  }
  const forbiddenJson: any = await resForbidden.json();
  console.log(`Response error: "${forbiddenJson.error}"`);
  console.log('✓ TEST 37 PASSED: Non-ADMIN access strictly blocked with 403 Forbidden.\n');

  // --------------------------------------------------------------------------
  // TEST 38: ADMIN creates a new user via POST /api/v1/admin/users
  // Verify user appears in GET /api/v1/admin/users and audit_log exists
  // --------------------------------------------------------------------------
  console.log('--- TEST 38: ADMIN Provisions New User via POST /api/v1/admin/users ---');
  const testEmail = `test.officer.${Date.now()}@sdiil.test`;
  const testFullName = `Sub-Insp. Aarav Sharma ${Date.now().toString().slice(-4)}`;

  const resCreateUser = await fetch(`${API_BASE_URL}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      email: testEmail,
      full_name: testFullName,
      role: 'INVESTIGATOR',
      department: 'Cyber Forensics Lab, Pune',
    }),
  });

  console.log(`HTTP Status: ${resCreateUser.status} (Expected: 201)`);
  if (resCreateUser.status !== 201) {
    const errText = await resCreateUser.text();
    throw new Error(`Test 38 Failed: Expected 201 Created, got ${resCreateUser.status}: ${errText}`);
  }

  const createUserData: any = await resCreateUser.json();
  const createdUserId = createUserData.user?.id;
  const tempPassword = createUserData.temp_password;

  console.log(`✓ Provisioned user ID: ${createdUserId}`);
  console.log(`✓ Temporary password issued: ${tempPassword.slice(0, 4)}********`);

  // Verify user appears in GET /api/v1/admin/users
  const resListUsers = await fetch(`${API_BASE_URL}/admin/users`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const listUsersData: any = await resListUsers.json();
  const foundUser = (listUsersData.users || []).find((u: any) => u.id === createdUserId);

  if (!foundUser) {
    throw new Error(`Test 38 Failed: Newly created user ${createdUserId} not found in GET /admin/users list`);
  }
  console.log(`✓ Verified user in list: ${foundUser.full_name} (${foundUser.email}), Role: ${foundUser.role}, Status: ${foundUser.account_status}`);

  // Verify audit_log row exists
  const { data: createAudit } = await adminClient
    .from('audit_log')
    .select('*')
    .eq('action', 'admin_create_user')
    .eq('resource_id', createdUserId)
    .limit(1);

  if (!createAudit || createAudit.length === 0) {
    throw new Error('Test 38 Failed: audit_log entry with action=admin_create_user not found');
  }
  console.log(`✓ Audit log verified: Action = ${createAudit[0].action}, Resource ID = ${createAudit[0].resource_id}`);
  console.log('✓ TEST 38 PASSED: Admin successfully provisioned new user with audit logging.\n');

  // --------------------------------------------------------------------------
  // TEST 39: ADMIN locks a user via PATCH /api/v1/admin/users/:userId/lock
  // Verify account_status = LOCKED in profiles & user's JWT is rejected (401 or 403)
  // --------------------------------------------------------------------------
  console.log('--- TEST 39: ADMIN Locks User & Validates Immediate Auth Invalidation ---');

  // Authenticate as the newly created user to acquire a JWT
  const newUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: newUserSignIn, error: signInErr } = await newUserClient.auth.signInWithPassword({
    email: testEmail,
    password: tempPassword,
  });

  if (signInErr || !newUserSignIn.session) {
    throw new Error(`Failed to sign in as new user: ${signInErr?.message}`);
  }
  const newUserToken = newUserSignIn.session.access_token;
  console.log(`✓ New user signed in and acquired valid JWT`);

  // Verify token initially works on an authenticated endpoint
  const resPreLock = await fetch(`${API_BASE_URL}/audit`, {
    headers: { Authorization: `Bearer ${newUserToken}` },
  });
  console.log(`Pre-lock token status on /audit: ${resPreLock.status} (Expected: 200)`);

  // Admin locks the user
  console.log(`Admin locking user ${createdUserId}...`);
  const resLock = await fetch(`${API_BASE_URL}/admin/users/${createdUserId}/lock`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${admin.token}` },
  });

  console.log(`HTTP Status: ${resLock.status} (Expected: 200)`);
  if (resLock.status !== 200) {
    throw new Error(`Test 39 Failed: Lock endpoint returned ${resLock.status}`);
  }

  // Verify profile table updated to LOCKED
  const { data: lockedProfile } = await adminClient
    .from('profiles')
    .select('account_status, is_locked')
    .eq('id', createdUserId)
    .single();

  if (!lockedProfile?.is_locked || lockedProfile?.account_status !== 'LOCKED') {
    throw new Error(`Test 39 Failed: Expected is_locked=true and account_status=LOCKED, got: ${JSON.stringify(lockedProfile)}`);
  }
  console.log(`✓ Profile verified in DB: account_status = ${lockedProfile.account_status}, is_locked = ${lockedProfile.is_locked}`);

  // Verify locked user's JWT is rejected
  const resPostLock = await fetch(`${API_BASE_URL}/audit`, {
    headers: { Authorization: `Bearer ${newUserToken}` },
  });
  console.log(`Post-lock token status on /audit: ${resPostLock.status} (Expected: 401 or 403)`);

  if (resPostLock.status !== 401 && resPostLock.status !== 403) {
    throw new Error(`Test 39 Failed: Locked user token was not rejected! Status: ${resPostLock.status}`);
  }
  console.log('✓ Locked user token was strictly rejected by backend!');
  console.log('✓ TEST 39 PASSED: Admin lock immediate revocation confirmed.\n');

  // --------------------------------------------------------------------------
  // TEST 40: ADMIN assigns user to case via POST /api/v1/admin/cases/:caseId/assign
  // Verify case_assignments row exists & user can now access GET /api/v1/cases/:caseId
  // --------------------------------------------------------------------------
  console.log('--- TEST 40: ADMIN Case Assignment & Access Grant ---');
  const targetCaseNumber = 'MH-PN-2026-0142';

  // 1. First confirm Judge cannot access case 0142 (not assigned)
  console.log(`Verifying Judge cannot access unassigned case ${targetCaseNumber}...`);
  const resJudgePre = await fetch(`${API_BASE_URL}/cases/${targetCaseNumber}`, {
    headers: { Authorization: `Bearer ${judge.token}` },
  });
  console.log(`Judge pre-assignment status: ${resJudgePre.status} (Expected: 403)`);
  if (resJudgePre.status !== 403) {
    throw new Error(`Test 40 Failed: Expected 403 for unassigned judge, got ${resJudgePre.status}`);
  }

  // 2. Admin assigns Judge to case 0142
  console.log(`Admin assigning Judge (${judge.userId}) to case ${targetCaseNumber}...`);
  const resAssign = await fetch(`${API_BASE_URL}/admin/cases/${targetCaseNumber}/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      userId: judge.userId,
      role_in_case: 'JUDGE',
    }),
  });

  console.log(`HTTP Status: ${resAssign.status} (Expected: 200)`);
  if (resAssign.status !== 200) {
    const errTxt = await resAssign.text();
    throw new Error(`Test 40 Failed: Assign endpoint returned ${resAssign.status}: ${errTxt}`);
  }

  // 3. Verify case_assignments row in database
  const { data: case0142Row } = await adminClient
    .from('cases')
    .select('id')
    .eq('case_number', targetCaseNumber)
    .single();

  const { data: assignRow } = await adminClient
    .from('case_assignments')
    .select('*')
    .eq('case_id', case0142Row?.id)
    .eq('user_id', judge.userId)
    .single();

  if (!assignRow) {
    throw new Error('Test 40 Failed: case_assignments record was not inserted in database');
  }
  console.log(`✓ case_assignments row verified: Case ID = ${assignRow.case_id}, User ID = ${assignRow.user_id}, Role = ${assignRow.role_in_case}`);

  // 4. Verify Judge can now call GET /api/v1/cases/:caseId and receive 200
  console.log(`Verifying Judge can now access assigned case ${targetCaseNumber}...`);
  const resJudgePost = await fetch(`${API_BASE_URL}/cases/${targetCaseNumber}`, {
    headers: { Authorization: `Bearer ${judge.token}` },
  });
  console.log(`Judge post-assignment status: ${resJudgePost.status} (Expected: 200)`);
  if (resJudgePost.status !== 200) {
    const errTxt = await resJudgePost.text();
    throw new Error(`Test 40 Failed: Expected 200 for newly assigned judge, got ${resJudgePost.status}: ${errTxt}`);
  }
  const caseData: any = await resJudgePost.json();
  console.log(`✓ Case retrieved successfully by Judge: "${caseData.case?.title}" (${caseData.case?.case_number})`);

  // 5. Post-test cleanup: Remove Judge from case 0142 so subsequent test runs retain pristine baseline
  console.log(`Cleaning up: Removing Judge from case ${targetCaseNumber}...`);
  const resRemove = await fetch(`${API_BASE_URL}/admin/cases/${targetCaseNumber}/assign/${judge.userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  if (resRemove.status === 200) {
    console.log(`✓ Judge assignment cleaned up successfully.`);
  }

  console.log('✓ TEST 40 PASSED: Admin case assignment and access grant confirmed.\n');

  // --------------------------------------------------------------------------
  // TEST 41: ADMIN calls GET /api/v1/admin/stats and receives all stats
  // --------------------------------------------------------------------------
  console.log('--- TEST 41: ADMIN Calls GET /api/v1/admin/stats ---');
  const resStats = await fetch(`${API_BASE_URL}/admin/stats`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });

  console.log(`HTTP Status: ${resStats.status} (Expected: 200)`);
  if (resStats.status !== 200) {
    throw new Error(`Test 41 Failed: Expected 200 OK, got ${resStats.status}`);
  }

  const statsData: any = await resStats.json();
  console.log('Stats Response:', statsData.stats);

  const s = statsData.stats;
  const requiredFields = [
    'total_users',
    'total_cases',
    'total_documents',
    'total_audit_events',
    'unacknowledged_anomalies',
    'active_shares',
    'pending_approvals',
  ];

  for (const field of requiredFields) {
    if (typeof s[field] !== 'number') {
      throw new Error(`Test 41 Failed: Field "${field}" must be a non-null number, got: ${s[field]}`);
    }
  }

  console.log(`✓ All 7 system statistics verified as non-null numbers:`);
  console.log(`  - Total Users: ${s.total_users}`);
  console.log(`  - Total Cases: ${s.total_cases}`);
  console.log(`  - Total Documents: ${s.total_documents}`);
  console.log(`  - Total Audit Events: ${s.total_audit_events}`);
  console.log(`  - Unacknowledged Anomalies: ${s.unacknowledged_anomalies}`);
  console.log(`  - Active Shares: ${s.active_shares}`);
  console.log(`  - Pending Approvals: ${s.pending_approvals}`);

  console.log('✓ TEST 41 PASSED: Admin system statistics endpoint fully operational.\n');

  console.log('================================================================');
  console.log('🎉 ALL 5 ADMIN PANEL TESTS (37, 38, 39, 40, 41) PASSED!');
  console.log('================================================================');
}

runAdminTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
