import { supabaseAdmin } from '../lib/supabaseAdmin.js';

async function check() {
  const { data: sbDocs1, error: err1 } = await supabaseAdmin
    .from('documents')
    .select(`
      id,
      case_id,
      title,
      sensitivity_level,
      cases (
        case_number
      )
    `)
    .limit(3);
  console.log('Query with cases (relation):', sbDocs1?.length, 'error:', err1);

  const { data: sbDocs2, error: err2 } = await supabaseAdmin
    .from('documents')
    .select(`
      id,
      case_id,
      title,
      sensitivity_level,
      cases:case_id (
        case_number
      )
    `)
    .limit(3);
  console.log('Query with cases:case_id:', sbDocs2?.length, 'error:', err2, 'first:', sbDocs2?.[0]);
}

check().catch(console.error);
