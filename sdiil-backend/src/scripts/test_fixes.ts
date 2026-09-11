import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), 'sdiil-backend/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_BASE = 'http://localhost:8000';

async function testAll() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Get sample document
  const { data: docs } = await admin
    .from('documents')
    .select('id, title, current_version_id')
    .eq('status', 'ACTIVE')
    .limit(1);

  const doc = docs?.[0];
  if (!doc) throw new Error('No active document found');

  // 2. Get registered hash
  const { data: ver } = await admin
    .from('document_versions')
    .select('id, file_hash')
    .eq('id', doc.current_version_id)
    .single();

  const originalHash = ver.file_hash;
  console.log(`Testing with Document: ${doc.id}`);
  console.log(`Original Hash: ${originalHash}`);

  // Test 1: Public endpoint with matching hash (VERIFIED)
  console.log('\n--- Test 1: GET /verify/:docId/:hash with valid original hash ---');
  const verifyRes = await fetch(`${API_BASE}/verify/${doc.id}/${originalHash}`);
  console.log('Status:', verifyRes.status);
  const verifyHtml = await verifyRes.text();
  const hasVerified = verifyHtml.includes('DOCUMENT VERIFIED') && verifyHtml.includes('22C97A') && verifyHtml.includes('✅');
  console.log('HTML contains DOCUMENT VERIFIED & #22C97A & ✅:', hasVerified);

  // Test 2: Public endpoint with tampered hash (TAMPERED)
  console.log('\n--- Test 2: GET /verify/:docId/:hash with tampered hash ---');
  const tamperedHash = 'a48640dedebb1a4cb4fe2bb7f7300acad22e34dfcf70290d6f36556faa41578f';
  const tamperedRes = await fetch(`${API_BASE}/verify/${doc.id}/${tamperedHash}`);
  console.log('Status:', tamperedRes.status);
  const tamperedHtml = await tamperedRes.text();
  const hasTampered = tamperedHtml.includes('TAMPERING DETECTED') && tamperedHtml.includes('E84545') && tamperedHtml.includes('❌');
  console.log('HTML contains TAMPERING DETECTED & #E84545 & ❌:', hasTampered);

  // Test 3: Public endpoint with non-existent document (NOT FOUND)
  console.log('\n--- Test 3: GET /verify/:docId/:hash with unknown doc_id ---');
  const notFoundRes = await fetch(`${API_BASE}/verify/00000000-0000-0000-0000-000000000000/${originalHash}`);
  console.log('Status:', notFoundRes.status);
  const notFoundHtml = await notFoundRes.text();
  const hasNotFound = notFoundHtml.includes('DOCUMENT NOT FOUND') && notFoundHtml.includes('F5A623') && notFoundHtml.includes('⚠️');
  console.log('HTML contains DOCUMENT NOT FOUND & #F5A623 & ⚠️:', hasNotFound);

  // Test 4: Authenticated user downloads verification report
  console.log('\n--- Test 4: Generate Verified Tamper Report PDF ---');
  const { data: authData } = await admin.auth.signInWithPassword({
    email: 'officer.demo@sdiil.test',
    password: 'Demo@Officer123',
  });
  const token = authData.session?.access_token;

  const reportRes = await fetch(`${API_BASE}/api/v1/documents/${doc.id}/verification-report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('Report Status:', reportRes.status);
  console.log('Content-Type:', reportRes.headers.get('content-type'));
  const reportBytes = await reportRes.arrayBuffer();
  console.log('Report PDF Size:', reportBytes.byteLength, 'bytes');

  // Test 5: Authenticated user downloads tampered report PDF
  console.log('\n--- Test 5: Generate Tampered Report PDF (simulated_tamper=true) ---');
  const tamperedReportRes = await fetch(`${API_BASE}/api/v1/documents/${doc.id}/verification-report?simulated_tamper=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('Tampered Report Status:', tamperedReportRes.status);
  console.log('Content-Type:', tamperedReportRes.headers.get('content-type'));
  const tamperedReportBytes = await tamperedReportRes.arrayBuffer();
  console.log('Tampered Report PDF Size:', tamperedReportBytes.byteLength, 'bytes');

  // Test 6: Document Viewer endpoint
  console.log('\n--- Test 6: GET /api/v1/documents/:id/view ---');
  const viewRes = await fetch(`${API_BASE}/api/v1/documents/${doc.id}/view`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('View Status:', viewRes.status);
  const viewJson = await viewRes.json();
  console.log('View URL present:', Boolean(viewJson.url));
  console.log('Expires in:', viewJson.expires_in);
  console.log('Mime type:', viewJson.mime_type);

  if (hasVerified && hasTampered && hasNotFound && reportBytes.byteLength > 0 && tamperedReportBytes.byteLength > 0 && viewJson.url) {
    console.log('\nALL 6 CHECKS PASSED PERFECTLY!');
  } else {
    console.error('\nSOME CHECKS FAILED!');
    process.exit(1);
  }
}

testAll().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
