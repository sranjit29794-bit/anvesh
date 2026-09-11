import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const PORT = 8000;
const API_BASE = `http://localhost:${PORT}/api/v1`;
const CASE_NUMBER = 'MH-PN-2026-0142';

function generateTOTP(secret: string, step = 30): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < secret.length; i++) {
    const val = alphabet.indexOf(secret[i].toUpperCase());
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const key = Buffer.from(output);
  const counter = Math.floor(Date.now() / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;
  return code.toString().padStart(6, '0');
}

async function main() {
  console.log('=== DIAGNOSIS: Supabase Storage & Download Endpoint Inspection ===\n');

  // Authenticate as officer
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'officer.demo@sdiil.test',
    password: 'Demo@Officer123',
  });

  let session = authData.session;
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpFactor = factors?.totp?.find((f) => f.status === 'verified');
  if (totpFactor) {
    const otpCode = generateTOTP('XXK4LHEU7K3XEOGWJ6TLIDYLWEWWQEQQ');
    const { data: challengeData } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
    const { data: verifyData } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code: otpCode,
    });
    session = verifyData;
  }

  const token = session!.access_token;
  console.log(`✓ Authenticated as officer: ${session!.user.id}\n`);

  // Step 1: List files in case-documents bucket
  console.log('--- DIAGNOSIS STEP 1: Supabase Storage bucket "case-documents" ---');
  const supabaseAdmin = createClient(SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // List files in the bucket (root level)
  const { data: rootFiles, error: rootErr } = await supabaseAdmin.storage
    .from('case-documents')
    .list('case_docs', { limit: 100 });

  console.log('Files in case_docs/ prefix:');
  if (rootErr) {
    console.log(`  Error listing: ${rootErr.message}`);
  } else if (!rootFiles || rootFiles.length === 0) {
    console.log('  No files found in case_docs/ prefix');
  } else {
    for (const f of rootFiles) {
      console.log(`  - ${f.name} (${f.metadata?.size || 'unknown'} bytes, type: ${f.metadata?.contentType || 'unknown'})`);
    }
  }

  // List all files recursively
  console.log('\nAll files in bucket (recursive):');
  const { data: allFiles, error: allErr } = await supabaseAdmin.storage
    .from('case-documents')
    .list('', { limit: 1000 });

  if (allErr) {
    console.log(`  Error listing all: ${allErr.message}`);
  } else if (!allFiles || allFiles.length === 0) {
    console.log('  No files found in bucket root');
  } else {
    for (const f of allFiles) {
      const size = f.metadata?.size || 0;
      const contentType = f.metadata?.contentType || 'unknown';
      console.log(`  - ${f.name} (${size} bytes, ${contentType})`);
      if (f.name.endsWith('/') || f.metadata?.size === undefined) {
        // It's a folder, list its contents
        const { data: subFiles } = await supabaseAdmin.storage
          .from('case-documents')
          .list(f.name, { limit: 50 });
        if (subFiles && subFiles.length > 0) {
          for (const sf of subFiles) {
            console.log(`    - ${f.name}${sf.name} (${sf.metadata?.size || 'unknown'} bytes, ${sf.metadata?.contentType || 'unknown'})`);
          }
        }
      }
    }
  }

  // Step 2: Query documents table for existing rows
  console.log('\n--- DIAGNOSIS STEP 2: Documents table records ---');
  const { data: docs, error: docErr } = await supabaseAdmin
    .from('documents')
    .select('id, title, doc_type, status, current_version_id, uploaded_by, created_at')
    .limit(10);

  if (docErr) {
    console.log(`  Error querying documents: ${docErr.message}`);
  } else {
    console.log(`  Found ${docs?.length || 0} documents:`);
    for (const doc of docs || []) {
      console.log(`  - ID: ${doc.id}`);
      console.log(`    Title: ${doc.title}`);
      console.log(`    Type: ${doc.doc_type}`);
      console.log(`    Status: ${doc.status}`);
      console.log(`    Version ID: ${doc.current_version_id}`);
      console.log(`    Uploaded by: ${doc.uploaded_by}`);
      console.log(`    Created: ${doc.created_at}`);
    }
  }

  // Step 3: Check for key_store / encryption
  console.log('\n--- DIAGNOSIS STEP 3: Check for encryption / key_store table ---');
  try {
    const { data: keyStore, error: keyErr } = await supabaseAdmin
      .from('key_store')
      .select('*')
      .limit(5);
    if (keyErr) {
      console.log(`  key_store table error: ${keyErr.message}`);
    } else {
      console.log(`  key_store table exists. Rows: ${keyStore?.length || 0}`);
      if (keyStore && keyStore.length > 0) {
        console.log(`  Sample row keys: ${Object.keys(keyStore[0]).join(', ')}`);
      }
    }
  } catch (e) {
    console.log(`  key_store query thrown: ${e}`);
  }

  // Check if documents have mime_type column
  const { data: testDoc } = await supabaseAdmin
    .from('documents')
    .select('mime_type')
    .limit(1)
    .maybeSingle();
  console.log(`  Documents table has mime_type column: ${testDoc !== null || "checked"}`);

  // Step 4: Try the download endpoint
  console.log('\n--- DIAGNOSIS STEP 4: GET /api/v1/documents/:id/download ---');
  if (docs && docs.length > 0) {
    const docId = docs[0].id;
    console.log(`  Using document ID: ${docId}`);

    const downloadRes = await fetch(`${API_BASE}/documents/${docId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log(`  Response status: ${downloadRes.status}`);
    console.log(`  Response headers:`);
    for (const [key, val] of downloadRes.headers.entries()) {
      console.log(`    ${key}: ${val}`);
    }

    const contentType = downloadRes.headers.get('content-type') || 'unknown';
    const contentDisposition = downloadRes.headers.get('content-disposition') || 'none';

    if (contentType.includes('application/json')) {
      const jsonBody = await downloadRes.json();
      console.log(`  Response body (JSON): ${JSON.stringify(jsonBody, null, 2)}`);
      if (jsonBody.signedUrl) {
        console.log(`\n  >>> FINDING: Response contains a signed URL string: ${jsonBody.signedUrl.substring(0, 100)}...`);
      }
    } else if (contentType.startsWith('application/pdf') || contentType.startsWith('image/')) {
      const buf = await downloadRes.arrayBuffer();
      console.log(`  Response body: ${buf.byteLength} bytes of ${contentType}`);
      const preview = Buffer.from(buf).slice(0, 16).toString('hex');
      console.log(`  First 16 bytes (hex): ${preview}`);
    } else {
      const text = await downloadRes.text();
      console.log(`  Response body (text): ${text.substring(0, 500)}`);
    }
  }

  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

main().catch((err) => {
  console.error('\n❌ Diagnosis Error:', err);
  process.exit(1);
});
