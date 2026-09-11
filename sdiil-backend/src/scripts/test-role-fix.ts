import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import { adminRouter } from '../routes/admin.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'sdiil-backend/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PORT = 8000;
const API_BASE_URL = `http://localhost:${PORT}/api/v1`;

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

async function runTests() {
  console.log('================================================================');
  console.log('  SDIIL Security Fix Test Suite: Admin Role Verification');
  console.log('================================================================\n');

  // Start internal test server if not already running on port 8000
  let serverInstance: any = null;
  let needCloseServer = false;
  try {
    const healthCheck = await fetch(`http://localhost:${PORT}/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      const app = express();
      app.use(cors());
      app.use(express.json());
      app.use('/api/v1/admin', adminRouter);
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
    // start server if probe errored
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api/v1/admin', adminRouter);
    app.get('/health', (_req, res) => res.json({ status: 'HEALTHY' }));

    serverInstance = await new Promise((resolve) => {
      const s = app.listen(PORT, () => {
        console.log(`✓ Test Express server listening on port ${PORT}`);
        resolve(s);
      });
    });
    needCloseServer = true;
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Authenticate demo accounts
  console.log('Authenticating demo accounts with Supabase Auth & MFA...');
  const officer = await authenticateDemoUser(
    'officer.demo@sdiil.test',
    'Demo@Officer123'
  );
  console.log(`✓ Officer authenticated (ID: ${officer.userId})`);

  const admin = await authenticateDemoUser(
    'admin.demo@sdiil.test',
    'Demo@Admin123'
  );
  console.log(`✓ Admin authenticated (ID: ${admin.userId})\n`);

  let passedTests = 0;

  try {
    // --------------------------------------------------------------------------
    // Test 42a: Officer calls PATCH /api/v1/admin/users/:userId/role with officer JWT
    // Must return 403. No data changed.
    // --------------------------------------------------------------------------
    console.log('--- Test 42a: Officer calls PATCH /api/v1/admin/users/:userId/role ---');
    const { data: profileBefore42a } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', officer.userId)
      .single();

    const initialOfficerRole = profileBefore42a?.role;
    console.log(`Initial Officer role in DB: "${initialOfficerRole}"`);

    const res42a = await fetch(`${API_BASE_URL}/admin/users/${officer.userId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${officer.token}`,
      },
      body: JSON.stringify({ role: 'ADMIN' }),
    });

    console.log(`HTTP Status: ${res42a.status} (Expected: 403)`);
    if (res42a.status !== 403) {
      throw new Error(`Test 42a Failed: Expected 403, got ${res42a.status}`);
    }

    const body42a: any = await res42a.json();
    console.log(`Response error message: "${body42a.error}"`);
    if (body42a.error !== 'Admin access required') {
      throw new Error(`Test 42a Failed: Expected error 'Admin access required', got '${body42a.error}'`);
    }

    const { data: profileAfter42a } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', officer.userId)
      .single();

    if (profileAfter42a?.role !== initialOfficerRole) {
      throw new Error(`Test 42a Failed: Data was changed! Role is now "${profileAfter42a?.role}"`);
    }

    console.log(`✓ Verified in database: Role remains unchanged ("${profileAfter42a?.role}")`);
    console.log('✓ Test 42a PASSED: Non-admin role update strictly blocked with 403 and 0 data changed.\n');
    passedTests++;

    // --------------------------------------------------------------------------
    // Test 42b: Officer calls GET /api/v1/admin/users with valid officer JWT
    // Must return 403. No user data leaked.
    // --------------------------------------------------------------------------
    console.log('--- Test 42b: Officer calls GET /api/v1/admin/users ---');
    const res42b = await fetch(`${API_BASE_URL}/admin/users`, {
      headers: {
        Authorization: `Bearer ${officer.token}`,
      },
    });

    console.log(`HTTP Status: ${res42b.status} (Expected: 403)`);
    if (res42b.status !== 403) {
      throw new Error(`Test 42b Failed: Expected 403, got ${res42b.status}`);
    }

    const body42b: any = await res42b.json();
    console.log(`Response error message: "${body42b.error}"`);
    if (body42b.error !== 'Admin access required') {
      throw new Error(`Test 42b Failed: Expected error 'Admin access required', got '${body42b.error}'`);
    }

    if (body42b.users || body42b.profiles || body42b.data) {
      throw new Error('Test 42b Failed: User data was leaked in 403 response body!');
    }

    console.log('✓ Verified: No user data or list returned in response.');
    console.log('✓ Test 42b PASSED: User listing strictly blocked with 403 and zero data leakage.\n');
    passedTests++;

    // --------------------------------------------------------------------------
    // Test 42c: Officer calls POST /api/v1/admin/cases with valid officer JWT
    // Must return 403.
    // --------------------------------------------------------------------------
    console.log('--- Test 42c: Officer calls POST /api/v1/admin/cases ---');
    const testCaseId = `PROBE-${Date.now()}`;
    const res42c = await fetch(`${API_BASE_URL}/admin/cases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${officer.token}`,
      },
      body: JSON.stringify({
        case_id: testCaseId,
        title: 'Unauthorized Case Probe By Officer',
      }),
    });

    console.log(`HTTP Status: ${res42c.status} (Expected: 403)`);
    if (res42c.status !== 403) {
      throw new Error(`Test 42c Failed: Expected 403, got ${res42c.status}`);
    }

    const body42c: any = await res42c.json();
    console.log(`Response error message: "${body42c.error}"`);
    if (body42c.error !== 'Admin access required') {
      throw new Error(`Test 42c Failed: Expected error 'Admin access required', got '${body42c.error}'`);
    }

    const { data: probedCase } = await adminClient
      .from('cases')
      .select('id')
      .eq('case_number', testCaseId)
      .maybeSingle();

    if (probedCase) {
      throw new Error(`Test 42c Failed: Case folder was created in database!`);
    }

    console.log(`✓ Verified in database: Case "${testCaseId}" was not created.`);
    console.log('✓ Test 42c PASSED: Non-admin case folder creation blocked with 403.\n');
    passedTests++;

    // --------------------------------------------------------------------------
    // Test 42d: ADMIN calls PATCH /api/v1/admin/users/:userId/role with admin JWT
    // Must return 200 and update the role. Revert the role change after confirming.
    // --------------------------------------------------------------------------
    console.log('--- Test 42d: ADMIN calls PATCH /api/v1/admin/users/:userId/role ---');
    const targetUserId = officer.userId;
    const { data: officerBeforeUpdate } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single();

    const baselineRole = officerBeforeUpdate?.role || 'officer';
    console.log(`Target user current role: "${baselineRole}"`);

    // 1. Admin updates target user's role to 'SUPERVISOR'
    console.log('ADMIN updating target user role to "SUPERVISOR"...');
    const res42dUpdate = await fetch(`${API_BASE_URL}/admin/users/${targetUserId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ role: 'SUPERVISOR' }),
    });

    console.log(`HTTP Status: ${res42dUpdate.status} (Expected: 200)`);
    if (res42dUpdate.status !== 200) {
      const errText = await res42dUpdate.text();
      throw new Error(`Test 42d Failed: Expected 200, got ${res42dUpdate.status}: ${errText}`);
    }

    const body42d: any = await res42dUpdate.json();
    console.log(`Response: success=${body42d.success}, role=${body42d.role}`);

    const { data: officerAfterUpdate } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single();

    if (officerAfterUpdate?.role !== 'SUPERVISOR') {
      throw new Error(`Test 42d Failed: Role was not updated in database. Expected 'SUPERVISOR', got '${officerAfterUpdate?.role}'`);
    }
    console.log(`✓ Verified in database: Role successfully updated to "${officerAfterUpdate?.role}"`);

    // 2. Revert the role change after confirming
    console.log(`Reverting role back to "${baselineRole}"...`);
    const res42dRevert = await fetch(`${API_BASE_URL}/admin/users/${targetUserId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ role: baselineRole }),
    });

    console.log(`Revert HTTP Status: ${res42dRevert.status} (Expected: 200)`);
    if (res42dRevert.status !== 200) {
      const errText = await res42dRevert.text();
      throw new Error(`Test 42d Failed reverting: Expected 200, got ${res42dRevert.status}: ${errText}`);
    }

    const { data: officerAfterRevert } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single();

    if (officerAfterRevert?.role?.toUpperCase() !== baselineRole.toUpperCase()) {
      throw new Error(`Test 42d Failed: Role was not reverted in database. Expected '${baselineRole}', got '${officerAfterRevert?.role}'`);
    }

    console.log(`✓ Verified in database: Role successfully reverted to "${officerAfterRevert?.role}"`);
    console.log('✓ Test 42d PASSED: Admin role update succeeded (200) and was cleanly reverted.\n');
    passedTests++;

  } finally {
    if (needCloseServer && serverInstance) {
      serverInstance.close();
      console.log('✓ Test server closed.');
    }
  }

  console.log('================================================================');
  console.log(`RESULT: ${passedTests}/4 passing`);
  console.log('================================================================');

  if (passedTests !== 4) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test run failed:', err);
  process.exit(1);
});
