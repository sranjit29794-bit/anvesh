import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), 'sdiil-backend/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_BASE = 'http://localhost:8000/api/v1';

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Authenticate officer
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'officer.demo@sdiil.test',
    password: 'Demo@Officer123',
  });

  if (authErr || !authData.session) {
    console.error('Auth error:', authErr);
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log('Officer logged in successfully.');

  // 2. Fetch seed documents
  const { data: docs } = await admin
    .from('documents')
    .select('id, title, doc_type, mime_type')
    .eq('status', 'ACTIVE')
    .limit(8);

  console.log(`Found ${docs?.length} active documents.`);
  const sampleDoc = docs?.[0];
  console.log('Sample Doc:', sampleDoc);

  if (!sampleDoc) {
    console.error('No sample doc found');
    return;
  }

  // Step 1: Call GET /api/v1/documents/:id/view with officer JWT
  console.log(`\nCalling GET ${API_BASE}/documents/${sampleDoc.id}/view...`);
  const viewRes = await fetch(`${API_BASE}/documents/${sampleDoc.id}/view`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const contentType = viewRes.headers.get('content-type');
  const viewJson = await viewRes.json();

  console.log('--- Step 1 Results ---');
  console.log('Status:', viewRes.status);
  console.log('Content-Type Header:', contentType);
  console.log('Is response JSON object with url field?', typeof viewJson === 'object' && 'url' in viewJson);
  console.log('Is response raw bytes?', false);
  console.log('Exact URL returned:', viewJson.url);
  console.log('Response JSON keys:', Object.keys(viewJson));

  // Step 2: Fetch the signed URL directly
  console.log('\n--- Step 2: Testing signed URL directly ---');
  const signedUrl = viewJson.url;
  const storageRes = await fetch(signedUrl);
  console.log('Direct Fetch Status:', storageRes.status);
  console.log('Direct Fetch Content-Type:', storageRes.headers.get('content-type'));
  console.log('Direct Fetch Content-Disposition:', storageRes.headers.get('content-disposition'));
  const rawBytes = await storageRes.arrayBuffer();
  const buffer = Buffer.from(rawBytes);
  console.log('Direct Fetch Byte Length:', buffer.length);
  console.log('Magic Bytes (first 5):', buffer.subarray(0, 5).toString('ascii'));

  // Step 4: Check package.json in sdiil-frontend
  const frontendPkg = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'sdiil-frontend/package.json'), 'utf-8')
  );
  console.log('\n--- Step 4: Frontend Dependencies ---');
  console.log('@react-pdf-viewer/core:', frontendPkg.dependencies?.['@react-pdf-viewer/core'] || 'NOT installed');
  console.log('@react-pdf-viewer/default-layout:', frontendPkg.dependencies?.['@react-pdf-viewer/default-layout'] || 'NOT installed');
  console.log('react-pdf:', frontendPkg.dependencies?.['react-pdf'] || 'NOT installed');
  console.log('pdfjs-dist:', frontendPkg.dependencies?.['pdfjs-dist'] || 'NOT installed');

  // Bug 2 Diagnostics
  console.log('\n================ BUG 2 DIAGNOSTICS ================');
  console.log('Checking PUBLIC_VERIFY_BASE_URL in env:');
  console.log('process.env.PUBLIC_VERIFY_BASE_URL:', process.env.PUBLIC_VERIFY_BASE_URL);

  // Check verification report generation
  console.log('\nTesting GET /api/v1/documents/:id/verify for sample doc...');
  const verifyRes = await fetch(`${API_BASE}/documents/${sampleDoc.id}/verify`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  console.log('Verify Status:', verifyRes.status);
  const verifyJson = await verifyRes.json();
  console.log('Verify Result:', {
    verified: verifyJson.verified,
    original_hash: verifyJson.original_hash,
    computed_hash: verifyJson.computed_hash,
    status: verifyJson.status,
  });
}

main().catch(console.error);
