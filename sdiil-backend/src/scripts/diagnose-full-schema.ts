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
  // Get all columns of documents table from information_schema
  const { data: docCols, error: docColsErr } = await admin
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_name', 'documents')
    .eq('table_schema', 'public');

  console.log('Documents table columns:');
  if (docColsErr) {
    console.log('Error:', docColsErr.message);
  } else {
    for (const col of docCols || []) {
      console.log(`  ${col.column_name} (${col.data_type})`);
    }
  }

  // Get abac_policies structure
  const { data: polCols, error: polColsErr } = await admin
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_name', 'abac_policies')
    .eq('table_schema', 'public');

  console.log('\nabac_policies table columns:');
  if (polColsErr) {
    console.log('Error:', polColsErr.message);
  } else {
    for (const col of polCols || []) {
      console.log(`  ${col.column_name} (${col.data_type})`);
    }
  }

  // Get sample abac_policies rows
  const { data: polRows } = await admin
    .from('abac_policies')
    .select('*')
    .limit(5);
  console.log('\nabac_policies sample rows:', JSON.stringify(polRows, null, 2));

  // Get sample document with all fields
  const { data: sampleDoc } = await admin
    .from('documents')
    .select('*')
    .limit(1)
    .maybeSingle();
  console.log('\nDocuments sample (all fields):');
  console.log(JSON.stringify(sampleDoc, null, 2));

  // Check storage paths - what files are actually in the bucket
  const { data: rootList } = await admin.storage
    .from('case-documents')
    .list('', { limit: 100 });

  console.log('\nStorage bucket root listing:');
  for (const f of rootList || []) {
    console.log(`  ${f.name} (size: ${f.metadata?.size}, type: ${f.metadata?.contentType})`);
  }

  // Navigate into case_docs/
  const { data: caseDocsList } = await admin.storage
    .from('case-documents')
    .list('case_docs', { limit: 100 });

  console.log('\nStorage case_docs/ listing:');
  for (const f of caseDocsList || []) {
    console.log(`  ${f.name}`);
    // Check if directory has subdirs
    if (f.metadata?.size === undefined || f.metadata?.size === 0) {
      const { data: subList } = await admin.storage
        .from('case-documents')
        .list(`case_docs/${f.name}`, { limit: 100 });
      for (const sf of subList || []) {
        console.log(`    ${sf.name} (size: ${sf.metadata?.size}, type: ${sf.metadata?.contentType})`);
        if (sf.metadata?.size === undefined || sf.metadata?.size === 0) {
          const { data: subSubList } = await admin.storage
            .from('case-documents')
            .list(`case_docs/${f.name}/${sf.name}`, { limit: 100 });
          for (const ssf of subSubList || []) {
            console.log(`      ${ssf.name} (size: ${ssf.metadata?.size}, type: ${ssf.metadata?.contentType})`);
          }
        }
      }
    }
  }
}

main().catch(console.error);
