import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
// Read env from .env file
const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
const envVars = Object.fromEntries(
  envFile
    .split('\n')
    .map((l) => l.trim().split('='))
    .filter((p) => p[0] && !p[0].startsWith('#'))
);

function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32.charAt(i).toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secret: string, step = 30): string {
  const counter = Math.floor(Date.now() / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}

async function verifyAuthFlow() {
  console.log('====================================================');
  console.log('  TESTING REAL SUPABASE AUTH & MFA VERIFICATION');
  console.log('====================================================\n');

  const url = envVars['VITE_SUPABASE_URL'] || '';
  const key = envVars['VITE_SUPABASE_ANON_KEY'] || '';
  const secretsPath = path.resolve(process.cwd(), 'src/config/demoMfaSecrets.json');
  const demoSecrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));

  const client = createClient(url, key, {
    auth: { persistSession: false },
  });

  // Step 1: Sign in with password
  console.log('1. Signing in with email: officer.demo@sdiil.test...');
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
    email: 'officer.demo@sdiil.test',
    password: 'Demo@Officer123',
  });
  if (signInError || !signInData.user) throw signInError;
  console.log(`   ✓ Password authenticated. User ID: ${signInData.user.id}`);

  // Step 2: Check MFA factors & AAL
  const { data: aalBefore } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  console.log(`2. AAL status before MFA challenge: current = ${aalBefore?.currentLevel}, next = ${aalBefore?.nextLevel}`);
  if (aalBefore?.currentLevel !== 'aal1' || aalBefore?.nextLevel !== 'aal2') {
    throw new Error('Expected AAL1 current and AAL2 next level');
  }

  const factors = await client.auth.mfa.listFactors();
  const totp = factors.data?.totp.find((f) => f.status === 'verified');
  if (!totp) throw new Error('No verified TOTP factor found');
  console.log(`   ✓ Verified TOTP factor found: ${totp.id}`);

  // Step 3: Issue challenge & verify with TOTP code
  console.log('3. Issuing MFA challenge...');
  const { data: challenge, error: chErr } = await client.auth.mfa.challenge({ factorId: totp.id });
  if (chErr || !challenge) throw chErr;

  const secret = demoSecrets['officer.demo@sdiil.test'].secret;
  const code = generateTOTP(secret);
  console.log(`   ✓ Generated live TOTP code from enrolled secret: ${code}`);

  const { error: vErr } = await client.auth.mfa.verify({
    factorId: totp.id,
    challengeId: challenge.id,
    code,
  });
  if (vErr) throw vErr;
  console.log('   ✓ MFA Challenge verified successfully with Supabase Auth!');

  // Step 4: Verify upgraded AAL
  const { data: aalAfter } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  console.log(`4. AAL status after MFA verification: current = ${aalAfter?.currentLevel}`);
  if (aalAfter?.currentLevel !== 'aal2') {
    throw new Error('Expected session to be elevated to AAL2');
  }

  // Step 5: Query Profile and Case Assignments
  console.log('5. Querying Profile & Case Assignments under RLS...');
  const { data: profile } = await client
    .from('profiles')
    .select('*')
    .eq('id', signInData.user.id)
    .single();
  console.log(`   ✓ Profile loaded: "${profile.name}" (Role: ${profile.role})`);

  const { data: assignments } = await client
    .from('case_assignments')
    .select('id, case_id, role_in_case, cases(id, case_number, title, status)')
    .eq('user_id', signInData.user.id);
  console.log(`   ✓ Case assignments retrieved: ${assignments?.length} assigned cases`);
  for (const a of (assignments || []) as any[]) {
    console.log(`     • [${a.cases?.case_number}] ${a.cases?.title} (Status: ${a.cases?.status})`);
  }

  // Step 6: Test Logout
  console.log('6. Signing out...');
  await client.auth.signOut();
  const { data: sessionAfterSignOut } = await client.auth.getSession();
  console.log(`   ✓ Session after signOut is null: ${sessionAfterSignOut.session === null}`);

  console.log('\n====================================================');
  console.log('  ALL AUTH & MFA TESTS PASSED SUCCESSFULLY! ✨');
  console.log('====================================================\n');
}

verifyAuthFlow().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
