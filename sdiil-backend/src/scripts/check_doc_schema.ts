import dotenv from 'dotenv';
import path from 'path';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

dotenv.config({ path: path.resolve(process.cwd(), 'sdiil-backend/.env') });

async function check() {
  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .limit(1)
    .single();

  console.log('Document row keys:', Object.keys(doc || {}));
  console.log('Document sample:', doc);

  const { data: ver } = await supabaseAdmin
    .from('document_versions')
    .select('*')
    .limit(1)
    .single();

  console.log('Version row keys:', Object.keys(ver || {}));
  console.log('Version sample:', ver);
}

check().catch(console.error);
