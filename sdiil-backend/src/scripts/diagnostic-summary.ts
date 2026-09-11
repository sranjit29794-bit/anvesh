import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('----------------------------------------------------------------------');
  console.log('DIAGNOSTIC 1: case_assignments table (All Rows)');
  console.log('----------------------------------------------------------------------');
  const { data: assignments, error: aErr } = await admin
    .from('case_assignments')
    .select('user_id, case_id, role_in_case');
  if (aErr) {
    console.error('Error:', aErr);
  } else {
    console.table(assignments);
    console.log(`Total Rows: ${assignments?.length}`);
  }

  console.log('\n----------------------------------------------------------------------');
  console.log('DIAGNOSTIC 2: cases table (All Rows)');
  console.log('----------------------------------------------------------------------');
  const { data: cases, error: cErr } = await admin
    .from('cases')
    .select('id, case_number, title, status');
  if (cErr) {
    console.error('Error:', cErr);
  } else {
    console.table(cases);
    console.log(`Total Rows: ${cases?.length}`);
  }

  console.log('\n----------------------------------------------------------------------');
  console.log('DIAGNOSTIC 3: documents table (All Rows with version storage paths)');
  console.log('----------------------------------------------------------------------');
  // In our Supabase schema:
  // - Table primary key is 'id'
  // - 'current_version_id' links to 'document_versions(id)'
  // - 'document_versions.storage_path' holds the file path in 'case-documents' bucket
  const { data: docs, error: dErr } = await admin
    .from('documents')
    .select(`
      id,
      case_id,
      doc_type,
      status,
      title,
      current_version_id,
      document_versions!fk_current_version (
        storage_path
      )
    `)
    .order('created_at', { ascending: false });

  if (dErr) {
    console.error('Error:', dErr);
  } else {
    const formattedDocs = (docs || []).map((d: any) => ({
      file_id: d.id,
      case_id: d.case_id,
      doc_type: d.doc_type,
      status: d.status,
      minio_path_or_storage_path: d.document_versions?.storage_path || 'NO_STORAGE_PATH',
      title: d.title,
    }));
    console.table(formattedDocs);
    console.log(`Total Documents: ${formattedDocs.length}`);

    const statusBreakdown = formattedDocs.reduce((acc: any, cur: any) => {
      acc[cur.status] = (acc[cur.status] || 0) + 1;
      return acc;
    }, {});
    console.log('Status Breakdown:', statusBreakdown);
  }

  console.log('\n----------------------------------------------------------------------');
  console.log('DIAGNOSTIC 4: POST /api/v1/auth/login and Supabase Auth Token Payload');
  console.log('----------------------------------------------------------------------');
  let backendEndpointStatus = 'NOT_CALLED';
  let backendEndpointBody = '';
  try {
    const res = await fetch('http://localhost:8000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'officer.demo@sdiil.test',
        password: 'Demo@Officer123',
      }),
    });
    backendEndpointStatus = `${res.status} ${res.statusText}`;
    backendEndpointBody = await res.text();
  } catch (err: any) {
    backendEndpointStatus = `Error: ${err.message}`;
  }
  console.log(`Call to http://localhost:8000/api/v1/auth/login: ${backendEndpointStatus}`);
  console.log(`Response body preview: ${backendEndpointBody.slice(0, 150)}`);

  console.log('\nSupabase Auth Login for officer.demo@sdiil.test:');
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authErr } = await anon.auth.signInWithPassword({
    email: 'officer.demo@sdiil.test',
    password: 'Demo@Officer123',
  });
  if (authErr) {
    console.error('Supabase Auth Error:', authErr.message);
  } else if (authData.session) {
    const rawJwt = authData.session.access_token;
    const parts = rawJwt.split('.');
    const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    console.log('Decoded JWT Payload:');
    console.log(JSON.stringify(decodedPayload, null, 2));
    console.log('\nSpecific fields check:');
    console.log('payload.role:', decodedPayload.role);
    console.log('payload.case_ids:', decodedPayload.case_ids);
    console.log('payload.user_metadata?.role:', decodedPayload.user_metadata?.role);
  }

  console.log('\n----------------------------------------------------------------------');
  console.log('DIAGNOSTIC 5: Supabase Storage bucket "case-documents" file list');
  console.log('----------------------------------------------------------------------');
  async function listAll(bucket: string, prefix = ''): Promise<string[]> {
    const { data: items, error } = await admin.storage.from(bucket).list(prefix, { limit: 100 });
    if (error || !items) return [];
    let list: string[] = [];
    for (const it of items) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null || !it.metadata) {
        const nested = await listAll(bucket, p);
        list.push(...nested);
      } else {
        list.push(p);
      }
    }
    return list;
  }

  const files = await listAll('case-documents');
  console.log(`Total files found: ${files.length}`);
  files.forEach((f, idx) => console.log(`[${idx + 1}] ${f}`));
}

main().catch(console.error);
