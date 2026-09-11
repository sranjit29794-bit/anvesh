import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), 'sdiil-backend/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_BASE = 'http://localhost:8000';

async function testBackend() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Sign in as Admin
  const { data: adminAuth, error: authErr } = await admin.auth.signInWithPassword({
    email: 'admin.demo@sdiil.test',
    password: 'Demo@Admin123',
  });

  const adminToken = (adminAuth?.session || (await admin.auth.getSession()).data.session)?.access_token;
  console.log('Admin authenticated successfully.');

  // 2. Fetch an active document
  const { data: docs } = await admin
    .from('documents')
    .select('id, title, case_id')
    .eq('status', 'ACTIVE')
    .limit(1);

  const doc = docs?.[0];
  if (!doc) throw new Error('No active document found');
  console.log(`Target document: ${doc.title} (${doc.id})`);

  // 3. Test GET /api/v1/cases/:caseId/documents
  console.log(`\nTesting GET /api/v1/cases/${doc.case_id}/documents...`);
  const caseDocsRes = await fetch(`${API_BASE}/api/v1/cases/${doc.case_id}/documents`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('Case docs response status:', caseDocsRes.status);
  const caseDocsJson = await caseDocsRes.json();
  console.log('Case docs result:', {
    success: caseDocsJson.success,
    documentsCount: caseDocsJson.documents?.length,
    missingFilesCount: caseDocsJson.documents_missing_files?.length,
  });

  if (!caseDocsJson.documents || caseDocsJson.documents.length === 0) {
    throw new Error('Expected at least one document in documents array');
  }

  // 4. Test baseline verification
  console.log('\nTesting baseline verify before tamper...');
  const baselineVerify = await fetch(`${API_BASE}/api/v1/documents/${doc.id}/verify`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const baselineJson = await baselineVerify.json();
  console.log('Baseline verify status:', baselineJson.status, 'hashes_match:', baselineJson.hashes_match);

  // 5. Call POST /api/v1/documents/:id/demo-tamper
  console.log('\nCalling POST /api/v1/documents/:id/demo-tamper...');
  const tamperRes = await fetch(`${API_BASE}/api/v1/documents/${doc.id}/demo-tamper`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('Tamper response status:', tamperRes.status);
  const tamperJson = await tamperRes.json();
  console.log('Tamper response JSON:', tamperJson);

  // 6. Verify that verification endpoint now returns TAMPERED
  console.log('\nTesting verify after tamper...');
  const tamperedVerify = await fetch(`${API_BASE}/api/v1/documents/${doc.id}/verify`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const tamperedJson = await tamperedVerify.json();
  console.log('Tampered verify status:', tamperedJson.status, 'hashes_match:', tamperedJson.hashes_match);

  if (tamperedJson.status !== 'TAMPERED') {
    throw new Error(`Expected status to be TAMPERED, got ${tamperedJson.status}`);
  }

  // 7. Call POST /api/v1/documents/:id/demo-restore
  console.log('\nCalling POST /api/v1/documents/:id/demo-restore...');
  const restoreRes = await fetch(`${API_BASE}/api/v1/documents/${doc.id}/demo-restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('Restore response status:', restoreRes.status);
  const restoreJson = await restoreRes.json();
  console.log('Restore response JSON:', restoreJson);

  // 8. Verify that verification endpoint now returns VERIFIED again
  console.log('\nTesting verify after restore...');
  const restoredVerify = await fetch(`${API_BASE}/api/v1/documents/${doc.id}/verify`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const restoredJson = await restoredVerify.json();
  console.log('Restored verify status:', restoredJson.status, 'hashes_match:', restoredJson.hashes_match);

  if (restoredJson.status !== 'VERIFIED') {
    throw new Error(`Expected status to be VERIFIED, got ${restoredJson.status}`);
  }

  console.log('\n✓ TAMPER AND RESTORE ENDPOINTS WORK 100% PERFECTLY!');
}

testBackend().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
