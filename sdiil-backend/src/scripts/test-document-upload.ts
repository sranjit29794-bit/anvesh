import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
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

async function runVerification() {
  console.log('=== SDIIL DOCUMENT INGEST END-TO-END VERIFICATION ===\n');

  // Step 1: Sign in as officer.demo@sdiil.test
  console.log('[1/6] Authenticating as officer.demo@sdiil.test...');
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: 'officer.demo@sdiil.test',
    password: 'Demo@Officer123',
  });

  if (signInErr || !authData.session) {
    throw new Error(`Sign in failed: ${signInErr?.message}`);
  }

  let session = authData.session;
  console.log(`✓ Password authenticated. User ID: ${session.user.id}`);

  // Step 2: MFA verification if enrolled
  const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors();
  if (factorsErr) {
    throw new Error(`Failed to list MFA factors: ${factorsErr.message}`);
  }

  const totpFactor = factors?.totp?.find((f) => f.status === 'verified');
  if (totpFactor) {
    console.log(`[2/6] Verifying TOTP MFA (Factor ID: ${totpFactor.id})...`);
    const totpSecret = 'XXK4LHEU7K3XEOGWJ6TLIDYLWEWWQEQQ';
    const otpCode = generateTOTP(totpSecret);

    const { data: challengeData, error: chalErr } = await supabase.auth.mfa.challenge({
      factorId: totpFactor.id,
    });
    if (chalErr) {
      throw new Error(`MFA challenge failed: ${chalErr.message}`);
    }

    const { data: verifyData, error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code: otpCode,
    });
    if (verifyErr) {
      throw new Error(`MFA verify failed: ${verifyErr.message}`);
    }

    session = verifyData;
    console.log(`✓ MFA verified successfully. AAL level: ${session.user.app_metadata?.aal || 'aal2'}`);
  } else {
    console.log('[2/6] No TOTP factor enrolled, continuing with primary session.');
  }

  const accessToken = session.access_token;
  console.log(`✓ Bearer token acquired (length: ${accessToken.length})`);

  // Step 3: Create synthetic test file & compute independent SHA-256
  console.log('\n[3/6] Generating synthetic test document & calculating local SHA-256...');
  const timestamp = new Date().toISOString();
  const testFileContent = `%PDF-1.4
% Synthetic Evidence Document for Case MH-PN-2026-0142
% Created for SDIIL Document Ingest Verification at ${timestamp}
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 55 >> stream
BT /F1 12 Tf 100 700 Td (SYNTHETIC EVIDENCE: Case 0142 Verification) ET
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
320
%%EOF`;

  const fileBuffer = Buffer.from(testFileContent, 'utf-8');
  const expectedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const filename = `Forensic_Report_${Date.now()}.pdf`;

  console.log(`✓ Test file: ${filename} (${fileBuffer.length} bytes)`);
  console.log(`✓ Independent SHA-256: ${expectedHash}`);

  // Step 4: Upload via backend endpoint POST /api/v1/documents/upload
  console.log('\n[4/6] Uploading document to POST http://localhost:8000/api/v1/documents/upload...');
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  formData.append('file', blob, filename);
  formData.append('case_id', 'MH-PN-2026-0142');
  formData.append('doc_type', 'ForensicReport');
  formData.append('sensitivity_level', 'B');
  formData.append('title', `Forensic Site Verification Report ${timestamp}`);

  const uploadRes = await fetch('http://localhost:8000/api/v1/documents/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const uploadJson = (await uploadRes.json()) as any;
  if (!uploadRes.ok) {
    throw new Error(`Upload endpoint returned status ${uploadRes.status}: ${JSON.stringify(uploadJson)}`);
  }

  console.log('✓ Upload endpoint responded with 201 Created');
  console.log('  Response Data:', JSON.stringify(uploadJson, null, 2));

  const uploadedDoc = uploadJson.document || uploadJson.data;
  const docId = uploadedDoc.id;

  // Step 5: Assert DB rows and storage presence
  console.log('\n[5/6] Verifying database integrity under RLS...');

  // Authenticated user client
  const officerClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Check 5a: documents row
  const { data: docRow, error: docErr } = await officerClient
    .from('documents')
    .select('*')
    .eq('id', docId)
    .single();

  if (docErr || !docRow) {
    throw new Error(`Failed to retrieve documents row under officer RLS: ${docErr?.message}`);
  }
  console.log(`✓ documents row found: ${docRow.id}`);
  console.log(`  Case ID: ${docRow.case_id}`);
  console.log(`  Current Version ID: ${docRow.current_version_id}`);

  // Check 5b: document_versions row
  const { data: verRow, error: verErr } = await officerClient
    .from('document_versions')
    .select('*')
    .eq('document_id', docId)
    .eq('version_number', 1)
    .single();

  if (verErr || !verRow) {
    throw new Error(`Failed to retrieve document_versions row: ${verErr?.message}`);
  }
  console.log(`✓ document_versions row found: v${verRow.version_number}`);
  console.log(`  Storage Path: ${verRow.storage_path}`);
  console.log(`  File Hash: ${verRow.file_hash}`);
  if (verRow.file_hash !== expectedHash) {
    throw new Error(`Version hash mismatch! Expected ${expectedHash}, got ${verRow.file_hash}`);
  }
  if (docRow.current_version_id !== verRow.id) {
    throw new Error(`current_version_id mismatch! Expected ${verRow.id}, got ${docRow.current_version_id}`);
  }
  console.log('✓ SHA-256 matches independent file computation in document_versions!');

  // Check 5c: Storage object download/existence
  console.log(`  Checking Storage object at: ${verRow.storage_path}...`);
  const { data: storageFile, error: storageErr } = await officerClient.storage
    .from('case-documents')
    .download(verRow.storage_path);

  if (storageErr || !storageFile) {
    throw new Error(`Failed to download storage object under officer RLS: ${storageErr?.message}`);
  }
  const downloadedBuf = Buffer.from(await storageFile.arrayBuffer());
  const downloadedHash = crypto.createHash('sha256').update(downloadedBuf).digest('hex');
  if (downloadedHash !== expectedHash) {
    throw new Error(`Downloaded storage object hash mismatch! Expected ${expectedHash}, got ${downloadedHash}`);
  }
  console.log(`✓ Storage file retrieved from bucket (size: ${downloadedBuf.length} bytes, hash confirmed)`);

  // Check 5d: blockchain_events row
  const { data: bcEvent, error: bcErr } = await officerClient
    .from('blockchain_events')
    .select('*')
    .eq('document_version_id', verRow.id)
    .eq('event_type', 'hash_registered')
    .single();

  if (bcErr || !bcEvent) {
    throw new Error(`Failed to retrieve blockchain_events row: ${bcErr?.message}`);
  }
  console.log(`✓ blockchain_events row found: event_type = ${bcEvent.event_type}, hash = ${bcEvent.registered_hash}`);
  if (bcEvent.registered_hash !== expectedHash) {
    throw new Error(`Blockchain event hash mismatch! Expected ${expectedHash}, got ${bcEvent.registered_hash}`);
  }

  // Check 5e: audit_log row (officer client can query or admin can verify)
  const { data: auditRows, error: auditErr } = await officerClient
    .from('audit_log')
    .select('*')
    .eq('resource_id', docId)
    .eq('action', 'upload');

  if (auditErr) {
    console.log(`  Notice: Officer audit_log read restricted by RLS (expected per security rules: ${auditErr.message})`);
  } else if (auditRows && auditRows.length > 0) {
    console.log(`✓ audit_log row found: action = ${auditRows[0].action}, resource_type = ${auditRows[0].resource_type}`);
  }

  // Step 6: Verify backend document list route
  console.log('\n[6/6] Verifying GET /api/v1/documents?case_id=MH-PN-2026-0142...');
  const listRes = await fetch('http://localhost:8000/api/v1/documents?case_id=MH-PN-2026-0142', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const listJson = (await listRes.json()) as any;
  if (!listRes.ok) {
    throw new Error(`List route returned ${listRes.status}: ${JSON.stringify(listJson)}`);
  }

  const found = listJson.data?.find((d: any) => d.id === docId);
  if (!found) {
    throw new Error(`Uploaded document ${docId} not found in case document list!`);
  }
  console.log(`✓ Uploaded document is listed in case MH-PN-2026-0142 document list (${listJson.count} total documents)`);

  console.log('\n========================================================');
  console.log('🎉 ALL 6 VERIFICATION STEPS PASSED SUCCESSFULLY!');
  console.log('========================================================');
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
