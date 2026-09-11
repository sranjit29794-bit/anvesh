import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'sdiil-backend/.env') });

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

async function main() {
  console.log('Checking/adding demo_tampered column to documents table...');

  // Try via rpc 'sql' if available
  const { error: rpcErr } = await admin.rpc('sql', {
    query: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'demo_tampered'
        ) THEN
          ALTER TABLE documents ADD COLUMN demo_tampered BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `,
  });

  if (rpcErr) {
    console.log('RPC error (expected if sql helper not present):', rpcErr.message);
  } else {
    console.log('Applied via RPC');
  }

  // Check if column exists by selecting it
  const { data, error: selErr } = await admin
    .from('documents')
    .select('id, demo_tampered')
    .limit(1);

  if (selErr) {
    console.error('Column check failed:', selErr.message);
  } else {
    console.log('demo_tampered column confirmed present! Sample row:', data);
  }
}

main().catch(console.error);
