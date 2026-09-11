import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

async function main() {
  // Check if mime_type column exists by selecting it
  const { data, error } = await admin
    .from('documents')
    .select('id, mime_type')
    .limit(1);

  console.log('mime_type check - error:', error?.message || 'none');
  console.log('mime_type check - data:', JSON.stringify(data));

  // Check abac_policies table
  const { data: policies, error: polErr } = await admin
    .from('abac_policies')
    .select('*')
    .limit(1);
  console.log('abac_policies table:', polErr?.message || `exists, rows: ${policies?.length || 0}`);

  // Check key_store table
  const { data: keyStore, error: keyErr } = await admin
    .from('key_store')
    .select('*')
    .limit(1);
  console.log('key_store table:', keyErr?.message || `exists, rows: ${keyStore?.length || 0}`);

  // List all storage files
  const { data: files, error: filesErr } = await admin.storage
    .from('case-documents')
    .list('case_docs/55024f48-b971-46aa-b0d5-420f1b4ccccb', { limit: 50 });
  console.log('Storage list:', filesErr?.message || `files: ${files?.length || 0}`);

  // Check document_versions table for first document
  const { data: versions, error: verErr } = await admin
    .from('document_versions')
    .select('*')
    .limit(1);
  console.log('document_versions sample:', JSON.stringify(versions?.[0], null, 2));
  if (verErr) console.log('Versions error:', verErr.message);
}

main().catch(console.error);
