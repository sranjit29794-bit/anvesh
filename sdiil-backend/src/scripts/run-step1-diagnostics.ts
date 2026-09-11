import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('=== DIAGNOSTIC 1: case_assignments table ===');
  const { data: assignments, error: assignErr } = await adminClient
    .from('case_assignments')
    .select('*');
  if (assignErr) {
    console.error('Assign Error:', assignErr);
  } else {
    console.log(`Found ${assignments?.length} assignment rows:`);
    console.log(JSON.stringify(assignments, null, 2));
  }

  console.log('\n=== DIAGNOSTIC 2: cases table ===');
  const { data: cases, error: caseErr } = await adminClient
    .from('cases')
    .select('*');
  if (caseErr) {
    console.error('Cases Error:', caseErr);
  } else {
    console.log(`Found ${cases?.length} case rows:`);
    console.log(JSON.stringify(cases, null, 2));
  }

  console.log('\n=== DIAGNOSTIC 3: documents table ===');
  const { data: docs, error: docErr } = await adminClient
    .from('documents')
    .select('*');
  if (docErr) {
    console.error('Doc Error:', docErr);
  } else {
    console.log(`Found ${docs?.length} document rows:`);
    console.log(JSON.stringify(docs, null, 2));
  }

  console.log('\n=== DIAGNOSTIC 4: POST /api/v1/auth/login check ===');
  try {
    const res = await fetch('http://localhost:8000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'officer.demo@sdiil.test',
        password: 'Demo@Officer123',
      }),
    });
    console.log(`POST /api/v1/auth/login HTTP status: ${res.status}`);
    const text = await res.text();
    console.log(`Response body: ${text}`);
  } catch (err: any) {
    console.log(`Error calling POST /api/v1/auth/login: ${err.message}`);
  }

  console.log('\n=== Also checking Supabase Auth token payload for officer.demo@sdiil.test ===');
  try {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: authData, error: authErr } = await anonClient.auth.signInWithPassword({
      email: 'officer.demo@sdiil.test',
      password: 'Demo@Officer123',
    });
    if (authErr) {
      console.log('Supabase signin error:', authErr);
    } else if (authData.session) {
      const parts = authData.session.access_token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      console.log('Supabase Access Token Payload:', JSON.stringify(payload, null, 2));
    }
  } catch (err: any) {
    console.log('Supabase signin exception:', err.message);
  }

  console.log('\n=== DIAGNOSTIC 5: Supabase Storage Buckets and Files ===');
  const { data: buckets, error: bErr } = await adminClient.storage.listBuckets();
  console.log('Available buckets:', buckets?.map((b) => b.name));

  // Recursively list all files in bucket if possible
  async function listAllFiles(bucket: string, prefix = ''): Promise<string[]> {
    const { data: items, error } = await adminClient.storage.from(bucket).list(prefix, { limit: 100 });
    if (error || !items) return [];
    let fileList: string[] = [];
    for (const item of items) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null || !item.metadata) {
        // folder
        const subFiles = await listAllFiles(bucket, fullPath);
        fileList.push(...subFiles);
      } else {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  const allCaseDocs = await listAllFiles('case-documents');
  console.log(`All files in 'case-documents' (${allCaseDocs.length}):`, allCaseDocs);

  for (const b of buckets || []) {
    if (b.name !== 'case-documents') {
      const files = await listAllFiles(b.name);
      console.log(`All files in '${b.name}' (${files.length}):`, files);
    }
  }
}

run().catch(console.error);
