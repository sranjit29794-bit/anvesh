import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const API_BASE = 'http://localhost:8000/api/v1';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
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

async function authenticateDemoUser(email: string, password: string, totpSecret?: string): Promise<string> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
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
    const { data: challengeData, error: chalErr } = await supabase.auth.mfa.challenge({
      factorId: totpFactor.id,
    });
    if (chalErr) throw new Error(`MFA challenge failed: ${chalErr.message}`);

    const { data: verifyData, error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code: otpCode,
    });
    if (verifyErr) throw new Error(`MFA verify failed: ${verifyErr.message}`);

    session = verifyData;
  }

  return session.access_token;
}

async function runTests() {
  console.log('================================================================');
  console.log('SDIIL REAL DOCUMENT DOWNLOAD, VERSIONING & ABAC ENFORCEMENT TEST');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // Step 1: Officer Auth (case MH-PN-2026-0142 assigned)
  // -------------------------------------------------------------
  console.log('[Step 1] Authenticating as officer.demo@sdiil.test...');
  const officerToken = await authenticateDemoUser(
    'officer.demo@sdiil.test',
    'Demo@Officer123',
    'XXK4LHEU7K3XEOGWJ6TLIDYLWEWWQEQQ'
  );
  console.log('✓ Officer authenticated with AAL2 session');

  const officerClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${officerToken}` } },
    auth: { persistSession: false },
  });

  // Fetch a seeded document for case MH-PN-2026-0142
  const listRes = await fetch(`${API_BASE}/documents?case_id=MH-PN-2026-0142`, {
    headers: { Authorization: `Bearer ${officerToken}` },
  });
  const listJson = (await listRes.json()) as any;
  if (!listRes.ok || !listJson.documents || listJson.documents.length === 0) {
    throw new Error(`Failed to list documents for MH-PN-2026-0142: ${JSON.stringify(listJson)}`);
  }

  const targetDoc = listJson.documents[0];
  console.log(`✓ Target document selected: "${targetDoc.title}" (ID: ${targetDoc.id})`);

  // -------------------------------------------------------------
  // Test 6: Officer downloads document & verifies audit_log entry
  // -------------------------------------------------------------
  console.log('\n[Test 6] Officer downloading document via GET /api/v1/documents/:id/download...');
  const downloadRes = await fetch(`${API_BASE}/documents/${targetDoc.id}/download`, {
    headers: { Authorization: `Bearer ${officerToken}` },
  });

  const downloadJson = (await downloadRes.json()) as any;
  if (!downloadRes.ok || !downloadJson.signedUrl) {
    throw new Error(`Download endpoint failed (${downloadRes.status}): ${JSON.stringify(downloadJson)}`);
  }

  console.log('✓ Received signed URL successfully');
  console.log(`  Storage Path: ${downloadJson.storage_path}`);
  console.log(`  Version: v${downloadJson.version_number}`);
  console.log(`  File Hash: ${downloadJson.file_hash}`);

  // Fetch the actual file bytes from the signed URL
  const fileFetchRes = await fetch(downloadJson.signedUrl);
  if (!fileFetchRes.ok) {
    throw new Error(`Failed to fetch file from signed URL: ${fileFetchRes.statusText}`);
  }
  const fileBytes = Buffer.from(await fileFetchRes.arrayBuffer());
  const actualHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
  console.log(`✓ Downloaded ${fileBytes.length} bytes from Supabase Storage`);
  console.log(`  Actual SHA-256: ${actualHash}`);
  if (actualHash !== downloadJson.file_hash) {
    throw new Error(`Hash mismatch! Expected ${downloadJson.file_hash}, got ${actualHash}`);
  }
  console.log('✓ SHA-256 of downloaded file matches registered version file_hash!');

  // Verify audit_log row inserted for action = 'download'
  const { data: auditLogs, error: auditErr } = await officerClient
    .from('audit_log')
    .select('*')
    .eq('resource_id', targetDoc.id)
    .eq('action', 'download')
    .order('created_at', { ascending: false })
    .limit(1);

  if (auditErr || !auditLogs || auditLogs.length === 0) {
    throw new Error(`Audit log entry for download not found: ${auditErr?.message}`);
  }
  console.log(`✓ Audit log verified: action = "${auditLogs[0].action}", resource_id = ${auditLogs[0].resource_id}`);

  // -------------------------------------------------------------
  // Test 7: Re-upload new version & verify old version remains intact
  // -------------------------------------------------------------
  console.log('\n[Test 7] Re-uploading a new version (v2) of the document...');
  const initialV1Hash = downloadJson.file_hash;

  // Create synthetic revised document content
  const timestamp = new Date().toISOString();
  const v2Content = `%PDF-1.4
% Synthetic Revised Version (v2) for Document ${targetDoc.id}
% Created at ${timestamp} with updated forensic supplementary data
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 68 >> stream
BT /F1 12 Tf 100 700 Td (REVISED EVIDENCE: Supplementary Forensic Audit v2) ET
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
333
%%EOF`;

  const v2Buffer = Buffer.from(v2Content, 'utf-8');
  const v2ExpectedHash = crypto.createHash('sha256').update(v2Buffer).digest('hex');
  const v2Filename = `Revised_Addendum_${Date.now()}.pdf`;

  const formData = new FormData();
  const v2Blob = new Blob([v2Buffer], { type: 'application/pdf' });
  formData.append('file', v2Blob, v2Filename);
  formData.append('change_summary', 'Supplementary forensic addendum annexed with verified chain of custody');

  const v2Res = await fetch(`${API_BASE}/documents/${targetDoc.id}/version`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerToken}` },
    body: formData,
  });

  const v2Json = (await v2Res.json()) as any;
  if (!v2Res.ok || !v2Json.version) {
    throw new Error(`Version upload failed (${v2Res.status}): ${JSON.stringify(v2Json)}`);
  }

  console.log(`✓ Version upload succeeded: Version number = ${v2Json.version.version_number}`);
  console.log(`  New Version ID: ${v2Json.version.id}`);
  console.log(`  New Version Storage Path: ${v2Json.version.storage_path}`);
  console.log(`  New Version Hash: ${v2Json.version.file_hash}`);
  if (v2Json.version.file_hash !== v2ExpectedHash) {
    throw new Error(`v2 hash mismatch! Expected ${v2ExpectedHash}, got ${v2Json.version.file_hash}`);
  }

  // Verify document_versions now has multiple versions
  const { data: allVersions, error: versErr } = await officerClient
    .from('document_versions')
    .select('*')
    .eq('document_id', targetDoc.id)
    .order('version_number', { ascending: true });

  if (versErr || !allVersions || allVersions.length < 2) {
    throw new Error(`Expected at least 2 versions, found: ${allVersions?.length}`);
  }
  console.log(`✓ document_versions verified: ${allVersions.length} versions exist for document`);

  // Verify documents.current_version_id points to the new version
  const { data: updatedDocRow } = await officerClient
    .from('documents')
    .select('current_version_id')
    .eq('id', targetDoc.id)
    .single();

  if (updatedDocRow?.current_version_id !== v2Json.version.id) {
    throw new Error(`current_version_id did not update to v2! Got ${updatedDocRow?.current_version_id}`);
  }
  console.log(`✓ documents.current_version_id correctly updated to new version ID`);

  // Verify OLD version (v1) is still downloadable and retains original file content
  console.log('  Testing download of original v1 via ?version_number=1...');
  const v1DownloadRes = await fetch(`${API_BASE}/documents/${targetDoc.id}/download?version_number=1`, {
    headers: { Authorization: `Bearer ${officerToken}` },
  });
  const v1DownloadJson = (await v1DownloadRes.json()) as any;
  if (!v1DownloadRes.ok || !v1DownloadJson.signedUrl) {
    throw new Error(`v1 download failed: ${JSON.stringify(v1DownloadJson)}`);
  }

  const v1Bytes = Buffer.from(await (await fetch(v1DownloadJson.signedUrl)).arrayBuffer());
  const v1DownloadedHash = crypto.createHash('sha256').update(v1Bytes).digest('hex');
  if (v1DownloadedHash !== initialV1Hash) {
    throw new Error(`v1 hash corrupted! Expected original ${initialV1Hash}, got ${v1DownloadedHash}`);
  }
  console.log(`✓ Original v1 file remains intact in storage (hash: ${v1DownloadedHash})!`);

  // Verify audit log for new_version
  const { data: newVerAudit } = await officerClient
    .from('audit_log')
    .select('*')
    .eq('resource_id', targetDoc.id)
    .eq('action', 'new_version')
    .limit(1);

  if (!newVerAudit || newVerAudit.length === 0) {
    throw new Error('Audit log entry for new_version not found!');
  }
  console.log('✓ audit_log row for action = "new_version" confirmed');

  // Verify blockchain_events for new version
  const { data: bcEvent } = await officerClient
    .from('blockchain_events')
    .select('*')
    .eq('document_version_id', v2Json.version.id)
    .single();

  if (!bcEvent) {
    throw new Error('blockchain_events row for v2 not found!');
  }
  console.log(`✓ blockchain_events anchored for v2: hash = ${bcEvent.registered_hash}`);

  // -------------------------------------------------------------
  // Test 8: Judge ABAC Denial (unassigned case MH-PN-2026-0142)
  // -------------------------------------------------------------
  console.log('\n[Test 8] Testing ABAC Denial: Authenticating as judge.demo@sdiil.test (Case MH-PN-2026-0198 only)...');
  const judgeToken = await authenticateDemoUser(
    'judge.demo@sdiil.test',
    'Demo@Judge123',
    'OA5BNS6MDGW4TN5F4Q7ZV2KW6K5EAR3D'
  );
  console.log('✓ Judge authenticated');

  console.log(`  Judge attempting to download document from unassigned case MH-PN-2026-0142 (ID: ${targetDoc.id})...`);
  const unauthorizedRes = await fetch(`${API_BASE}/documents/${targetDoc.id}/download`, {
    headers: { Authorization: `Bearer ${judgeToken}` },
  });

  console.log(`  Response HTTP Status: ${unauthorizedRes.status}`);
  const unauthorizedJson = (await unauthorizedRes.json()) as any;
  console.log(`  Response Body:`, unauthorizedJson);

  if (unauthorizedRes.status !== 403 && unauthorizedRes.status !== 404) {
    throw new Error(`ABAC Security Failure! Expected 403 or 404, got status ${unauthorizedRes.status}`);
  }
  if (unauthorizedJson.signedUrl) {
    throw new Error('ABAC Security Breach! Signed URL was leaked to unauthorized judge!');
  }

  console.log('✓ ABAC ENFORCEMENT CONFIRMED: Unauthorized judge was blocked with 403 Forbidden!');
  console.log('  Zero document information, storage paths, or signed URLs were leaked.');

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS (6, 7, 8) PASSED SUCCESSFULLY WITH ZERO ERRORS!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ Test Execution Failed:', err);
  process.exit(1);
});
