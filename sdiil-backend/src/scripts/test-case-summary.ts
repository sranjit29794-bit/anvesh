import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

  let secret = totpSecret;
  try {
    const candidates = [
      path.resolve(process.cwd(), 'sdiil-frontend/src/config/demoMfaSecrets.json'),
      path.resolve(__dirname, '../../../sdiil-frontend/src/config/demoMfaSecrets.json'),
      path.resolve(__dirname, '../../../../sdiil-frontend/src/config/demoMfaSecrets.json'),
      path.resolve(process.cwd(), '../sdiil-frontend/src/config/demoMfaSecrets.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const json = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (json[email.toLowerCase()]?.secret) {
          secret = json[email.toLowerCase()].secret;
          break;
        }
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

async function runCaseSummaryTests() {
  console.log('================================================================');
  console.log('  SDIIL Phase 9: AI Case Summary Test Suite (Tests 29-31)');
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

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // --------------------------------------------------------------------------
  // TEST 29: Anonymous Request Returns 401
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 29: Anonymous Request Rejected with 401 (rule-no-anonymous-access) ---');
  const resAnonymous = await fetch(`${API_BASE_URL}/cases/MH-PN-2026-0198/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  console.log(`HTTP Status: ${resAnonymous.status} (Expected: 401)`);
  if (resAnonymous.status !== 401) {
    throw new Error(`Test 29 Failed: Expected 401 Unauthorized, got ${resAnonymous.status}`);
  }
  const noAuthJson: any = await resAnonymous.json();
  console.log(`Response error: "${noAuthJson.error}"`);
  console.log('✓ TEST 29 PASSED: Anonymous access strictly blocked.\n');

  // --------------------------------------------------------------------------
  // TEST 30: Officer on Assigned Case Gets Real Summary (>= 3 cited docs & 5 sections)
  // --------------------------------------------------------------------------
  console.log('--- TEST 30: Officer Requests Summary for Assigned Case (MH-PN-2026-0198) ---');
  console.log('Invoking POST /api/v1/cases/MH-PN-2026-0198/summary with Gemini LLM synthesis...');

  let resOfficer: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    resOfficer = await fetch(`${API_BASE_URL}/cases/MH-PN-2026-0198/summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${officer.token}`,
      },
    });
    if (resOfficer.status === 200) break;
    if (attempt < 3) {
      console.log(`Attempt ${attempt} returned status ${resOfficer.status}. Retrying in 2 seconds...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`HTTP Status: ${resOfficer.status} (Expected: 200)`);
  if (resOfficer.status !== 200) {
    const errText = await resOfficer.text();
    throw new Error(`Test 30 Failed: Expected 200 OK, got ${resOfficer.status}: ${errText}`);
  }

  const officerData: any = await resOfficer.json();
  console.log(`Requires Human Verification Flag: ${officerData.requires_human_verification}`);
  console.log(`Chunks Used: ${officerData.chunks_used}`);
  console.log(`Total Cited Document IDs Count: ${officerData.cited_doc_ids?.length}`);
  console.log(`Cited Doc IDs:`, officerData.cited_doc_ids);

  if (officerData.requires_human_verification !== true) {
    throw new Error('Test 30 Failed: requires_human_verification must be true at top level');
  }

  const summary = officerData.summary;
  if (!summary) {
    throw new Error('Test 30 Failed: summary object missing in response');
  }

  const requiredSections = [
    'case_overview',
    'key_incidents',
    'persons_of_interest',
    'evidence_summary',
    'investigation_status',
  ];

  for (const sec of requiredSections) {
    if (!summary[sec] || !summary[sec].content || summary[sec].content.trim().length === 0) {
      throw new Error(`Test 30 Failed: Section '${sec}' missing or empty in summary`);
    }
    console.log(`  ✓ Section [${summary[sec].title || sec}]: ${summary[sec].content.slice(0, 100)}... (Citations: ${summary[sec].cited_doc_ids?.length || 0})`);
  }

  if (!officerData.cited_doc_ids || officerData.cited_doc_ids.length < 3) {
    throw new Error(`Test 30 Failed: Expected at least 3 cited doc_ids, got ${officerData.cited_doc_ids?.length || 0}`);
  }

  // Verify audit log has action = 'case_summary'
  const { data: auditLogs } = await adminClient
    .from('audit_log')
    .select('*')
    .eq('action', 'case_summary')
    .eq('user_id', officer.userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!auditLogs || auditLogs.length === 0) {
    throw new Error('Test 30 Failed: audit_log entry for case_summary not found');
  }
  console.log(`✓ Audit log verified: Action = ${auditLogs[0].action}, Chunks Used = ${auditLogs[0].metadata?.chunks_used}`);
  console.log('✓ TEST 30 PASSED: Real Gemini case summary synthesized with 5 complete sections & >= 3 citations.\n');

  // --------------------------------------------------------------------------
  // TEST 31: Judge on Unassigned Case Gets 403 (Zero Content Leakage)
  // --------------------------------------------------------------------------
  console.log('--- TEST 31: Judge on Unassigned Case (MH-PN-2026-0142) Blocked with 403 ---');
  console.log('Note: Judge is assigned only to MH-PN-2026-0198.');

  const resJudge = await fetch(`${API_BASE_URL}/cases/MH-PN-2026-0142/summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${judge.token}`,
    },
  });

  console.log(`HTTP Status: ${resJudge.status} (Expected: 403)`);
  if (resJudge.status !== 403) {
    throw new Error(`Test 31 Failed: Expected 403 Forbidden, got ${resJudge.status}`);
  }

  const judgeData: any = await resJudge.json();
  console.log(`Response body:`, judgeData);

  if (judgeData.summary || judgeData.cited_doc_ids || judgeData.chunks_used) {
    throw new Error('Test 31 Failed: Information leakage detected in 403 response!');
  }

  console.log('✓ TEST 31 PASSED: Unassigned judge strictly rejected with 403 Forbidden. Zero content leaked.\n');

  console.log('================================================================');
  console.log('🎉 ALL 3 AI CASE SUMMARY TESTS (29, 30, 31) PASSED PERFECTLY!');
  console.log('================================================================');
}

runCaseSummaryTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
