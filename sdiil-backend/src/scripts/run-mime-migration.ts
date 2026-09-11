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
  // Add mime_type column
  const { error } = await admin.rpc('sql', {
    query: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'mime_type'
        ) THEN
          ALTER TABLE documents ADD COLUMN mime_type TEXT;
          UPDATE documents SET mime_type = 'application/pdf' WHERE mime_type IS NULL;
        END IF;
      END $$;
    `,
  });

  if (error) {
    console.error('RPC error:', error.message);

    // Try direct approach using supabaseAdmin.from or storage API
    console.log('Trying alternative approach...');
  } else {
    console.log('Migration applied successfully via RPC');
  }

  // Verify
  const { data, error: verifyErr } = await admin
    .from('documents')
    .select('id, mime_type')
    .limit(1);

  console.log('Verification:', verifyErr ? verifyErr.message : JSON.stringify(data));
}

main().catch(console.error);
