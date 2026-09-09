import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

// If anon key not in backend .env, read from sdiil-frontend/.env
let resolvedAnonKey = supabaseAnonKey;
if (!resolvedAnonKey) {
  try {
    const frontendEnvPath = path.resolve(process.cwd(), '../sdiil-frontend/.env');
    if (fs.existsSync(frontendEnvPath)) {
      const feEnv = Object.fromEntries(
        fs.readFileSync(frontendEnvPath, 'utf8')
          .split('\n')
          .map((l) => l.trim().split('='))
          .filter((p) => p[0])
      );
      resolvedAnonKey = feEnv['VITE_SUPABASE_ANON_KEY'] || '';
    }
  } catch (e) {
    // ignore
  }
}

const DEMO_USERS = [
  { email: 'officer.demo@sdiil.test', password: 'Demo@Officer123', role: 'officer', name: 'Insp. Vikram Rathore' },
  { email: 'supervisor.demo@sdiil.test', password: 'Demo@Supervisor123', role: 'supervisor', name: 'SP Sunita Sharma' },
  { email: 'admin.demo@sdiil.test', password: 'Demo@Admin123', role: 'admin', name: 'System Administrator' },
  { email: 'judge.demo@sdiil.test', password: 'Demo@Judge123', role: 'judge', name: 'Hon. Justice Rajesh Verma' },
];

/**
 * RFC 6238 TOTP computation using native Node crypto
 */
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

async function enrollDemoMfa() {
  console.log('====================================================');
  console.log('  Enrolling Real Supabase TOTP MFA for Demo Users');
  console.log('====================================================\n');

  if (!supabaseUrl || !resolvedAnonKey) {
    throw new Error('Supabase URL or Anon key missing.');
  }

  const results: Record<
    string,
    { role: string; name: string; factorId: string; secret: string; uri: string }
  > = {};

  for (const user of DEMO_USERS) {
    console.log(`Processing: ${user.email} (${user.role})...`);
    // Create dedicated client instance so auth sessions don't collide
    const client = createClient(supabaseUrl, resolvedAnonKey, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });

    if (authError || !authData.user) {
      throw new Error(`Sign in failed for ${user.email}: ${authError?.message}`);
    }

    // Delete any existing factors via supabaseAdmin to allow fresh enrollment without requiring AAL2
    const adminClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || '', {
      auth: { persistSession: false },
    });
    const { data: adminFactors } = await adminClient.auth.admin.mfa.listFactors({ userId: authData.user.id });
    if (adminFactors?.factors?.length) {
      for (const f of adminFactors.factors) {
        await adminClient.auth.admin.mfa.deleteFactor({ id: f.id, userId: authData.user.id });
      }
    }

    // Refresh session or sign in fresh
    const { data: freshAuth } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });

    // Enroll fresh TOTP factor
    const enrollRes = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `${user.name} (${user.role})`,
      issuer: 'SDIIL ICJS',
    });

    if (enrollRes.error || !enrollRes.data?.totp) {
      throw new Error(`MFA Enroll failed for ${user.email}: ${enrollRes.error?.message}`);
    }

    const factorId = enrollRes.data.id;
    const secret = enrollRes.data.totp.secret;
    const uri = enrollRes.data.totp.uri;

    // Challenge and verify immediately to activate the factor
    const challengeRes = await client.auth.mfa.challenge({ factorId });
    if (challengeRes.error || !challengeRes.data) {
      throw new Error(`Challenge failed for ${user.email}: ${challengeRes.error?.message}`);
    }

    const code = generateTOTP(secret);
    const verifyRes = await client.auth.mfa.verify({
      factorId,
      challengeId: challengeRes.data.id,
      code,
    });

    if (verifyRes.error) {
      throw new Error(`Verification failed for ${user.email}: ${verifyRes.error.message}`);
    }

    results[user.email] = {
      role: user.role,
      name: user.name,
      factorId,
      secret,
      uri,
    };

    console.log(`  ✓ Enrolled & Verified: ${user.email}`);
    console.log(`    Factor ID: ${factorId}`);
    console.log(`    Secret:    ${secret}`);
    console.log(`    Live TOTP: ${code}\n`);
  }

  // Write demo secrets to frontend for helper UI
  const frontendConfigDir = path.resolve(process.cwd(), '../sdiil-frontend/src/config');
  if (!fs.existsSync(frontendConfigDir)) {
    fs.mkdirSync(frontendConfigDir, { recursive: true });
  }

  const secretsFilePath = path.join(frontendConfigDir, 'demoMfaSecrets.json');
  fs.writeFileSync(secretsFilePath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`✓ Saved demo MFA secrets to: ${secretsFilePath}\n`);

  console.log('====================================================');
  console.log('  ALL 4 DEMO USERS ENROLLED IN MFA SUCCESSFULLY!');
  console.log('====================================================\n');
}

enrollDemoMfa().catch((err) => {
  console.error('MFA Enrollment failed:', err);
  process.exit(1);
});
