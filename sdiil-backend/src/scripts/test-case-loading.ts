import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
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

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  password = 'Password123!'
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

  let secret: string | undefined;
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

async function main() {
  console.log('================================================================');
  console.log('  SDIIL Architectural Test Suite: Case & Document Loading');
  console.log('================================================================\n');

  let passCount = 0;
  let failCount = 0;

  // 1. Authenticate users
  console.log('Authenticating demo users with Supabase GoTrue MFA...');
  const officer = await authenticateDemoUser('officer.demo@sdiil.test', 'Demo@Officer123');
  const judge = await authenticateDemoUser('judge.demo@sdiil.test', 'Demo@Judge123');
  console.log(`Officer userId: ${officer.userId}`);
  console.log(`Judge userId: ${judge.userId}\n`);

  // Query actual DB assignments for officer and judge
  const { data: officerAssignments } = await supabaseAdmin
    .from('case_assignments')
    .select('case_id')
    .eq('user_id', officer.userId);
  const officerCaseIds = (officerAssignments || []).map((a) => a.case_id);

  const { data: judgeAssignments } = await supabaseAdmin
    .from('case_assignments')
    .select('case_id')
    .eq('user_id', judge.userId);
  const judgeCaseIds = (judgeAssignments || []).map((a) => a.case_id);

  console.log(`Officer DB assigned cases: ${JSON.stringify(officerCaseIds)}`);
  console.log(`Judge DB assigned cases: ${JSON.stringify(judgeCaseIds)}\n`);

  // ============================================================================
  // Test 57: Officer calls GET /api/v1/cases with real Supabase JWT
  // ============================================================================
  try {
    console.log('Running Test 57: Officer calls GET /api/v1/cases with real Supabase JWT...');
    const res = await fetch(`${API_BASE_URL}/cases`, {
      headers: { Authorization: `Bearer ${officer.token}` },
    });

    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }

    const json = await res.json();
    if (!json.success || !Array.isArray(json.cases)) {
      throw new Error(`Expected { success: true, cases: [] }, got ${JSON.stringify(json)}`);
    }

    if (json.cases.length === 0) {
      throw new Error('Officer cases array is unexpectedly empty despite assigned cases.');
    }

    const returnedCaseIds = json.cases.map((c: any) => c.case_id || c.id);
    for (const expectedId of officerCaseIds) {
      if (!returnedCaseIds.includes(expectedId)) {
        throw new Error(`Expected case ${expectedId} to be returned in officer cases.`);
      }
    }

    console.log(`  ✓ Passed: Officer received ${json.cases.length} assigned cases matching DB rows.`);
    passCount++;
  } catch (err: any) {
    console.error(`  ✗ Test 57 Failed: ${err.message}`);
    failCount++;
  }

  // ============================================================================
  // Test 58: Judge calls GET /api/v1/cases. Returns only judge's assigned cases
  // ============================================================================
  try {
    console.log('\nRunning Test 58: Judge calls GET /api/v1/cases (strict case scoping)...');
    const res = await fetch(`${API_BASE_URL}/cases`, {
      headers: { Authorization: `Bearer ${judge.token}` },
    });

    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }

    const json = await res.json();
    if (!json.success || !Array.isArray(json.cases)) {
      throw new Error(`Expected { success: true, cases: [] }, got ${JSON.stringify(json)}`);
    }

    const returnedCaseIds = json.cases.map((c: any) => c.case_id || c.id);
    // Every returned case MUST be in judge's assigned cases
    for (const id of returnedCaseIds) {
      if (!judgeCaseIds.includes(id)) {
        throw new Error(`Judge received unassigned case ${id}!`);
      }
    }

    // Check that officer-only cases are NOT in judge's returned cases
    const officerOnly = officerCaseIds.filter((id) => !judgeCaseIds.includes(id));
    for (const unassignedId of officerOnly) {
      if (returnedCaseIds.includes(unassignedId)) {
        throw new Error(`Judge received officer-only case ${unassignedId}!`);
      }
    }

    console.log(`  ✓ Passed: Judge received only their ${json.cases.length} assigned cases.`);
    passCount++;
  } catch (err: any) {
    console.error(`  ✗ Test 58 Failed: ${err.message}`);
    failCount++;
  }

  // ============================================================================
  // Test 59: Officer calls GET /api/v1/documents for their assigned case
  // ============================================================================
  let sampleDocId: string | null = null;
  try {
    const assignedCase = officerCaseIds[0];
    console.log(`\nRunning Test 59: Officer calls GET /api/v1/documents for assigned case ${assignedCase}...`);
    const res = await fetch(`${API_BASE_URL}/documents?case_id=${assignedCase}&status=ACTIVE`, {
      headers: { Authorization: `Bearer ${officer.token}` },
    });

    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }

    const json = await res.json();
    const docs = json.documents || json.data || [];

    if (!Array.isArray(docs) || docs.length === 0) {
      throw new Error('Expected non-empty array of active documents for assigned case.');
    }

    // Ensure all returned docs have status ACTIVE
    for (const d of docs) {
      if (d.status && d.status !== 'ACTIVE') {
        throw new Error(`Document ${d.id || d.file_id} has non-active status: ${d.status}`);
      }
    }

    sampleDocId = docs[0].id || docs[0].file_id;
    console.log(`  ✓ Passed: Officer received ${docs.length} ACTIVE documents for case (Sample doc: ${sampleDocId}).`);
    passCount++;
  } catch (err: any) {
    console.error(`  ✗ Test 59 Failed: ${err.message}`);
    failCount++;
  }

  // ============================================================================
  // Test 60: Call GET /api/v1/documents/:id/view for a document in an assigned case
  // ============================================================================
  try {
    if (!sampleDocId) {
      throw new Error('No sample document ID available from Test 59.');
    }
    console.log(`\nRunning Test 60: Officer calls GET /api/v1/documents/${sampleDocId}/view...`);
    const res = await fetch(`${API_BASE_URL}/documents/${sampleDocId}/view`, {
      headers: { Authorization: `Bearer ${officer.token}` },
    });

    if (res.status !== 200) {
      const errText = await res.text();
      throw new Error(`Expected HTTP 200, got ${res.status}: ${errText}`);
    }

    const json = await res.json();
    if (!json.success) {
      throw new Error(`View endpoint returned failure: ${JSON.stringify(json)}`);
    }

    if (json.type !== 'signed_url' && json.type !== 'text_only') {
      throw new Error(`Expected type 'signed_url' or 'text_only', got: ${json.type}`);
    }

    if (json.type === 'signed_url') {
      if (!json.url && !json.signedUrl) {
        throw new Error('signed_url type returned but url field is missing.');
      }
      console.log(`  ✓ Passed: Received valid signed URL: ${(json.url || json.signedUrl).slice(0, 50)}...`);
    } else {
      if (!json.content) {
        throw new Error('text_only type returned but content field is missing.');
      }
      console.log(`  ✓ Passed: Received valid text_only response (${json.content.length} chars).`);
    }

    passCount++;
  } catch (err: any) {
    console.error(`  ✗ Test 60 Failed: ${err.message}`);
    failCount++;
  }

  console.log('\n================================================================');
  console.log(`  Summary: ${passCount} Passed, ${failCount} Failed`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
