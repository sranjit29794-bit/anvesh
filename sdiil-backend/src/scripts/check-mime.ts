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
  const { data, error } = await admin.from('documents').select('id, mime_type').limit(5);
  if (error) {
    console.log('error:', error.message);
  } else {
    console.log('documents with mime_type:', JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
