import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { indexDocument } from '../lib/aiService.js';

dotenv.config();

async function runBackfill() {
  console.log('================================================================');
  console.log('  SDIIL Document Embeddings Backfill Routine');
  console.log('================================================================\n');

  // Fetch all documents
  const { data: docs, error: docErr } = await supabaseAdmin
    .from('documents')
    .select(`
      id,
      case_id,
      title,
      doc_type,
      sensitivity_level,
      current_version_id,
      cases (
        case_number
      ),
      document_versions!current_version_id (
        id,
        storage_path,
        version_number
      )
    `);

  if (docErr || !docs) {
    throw new Error(`Failed to fetch documents for backfill: ${docErr?.message}`);
  }

  console.log(`Found ${docs.length} documents to backfill embeddings for.\n`);

  let totalChunks = 0;
  const seedAssetsDir = path.resolve(process.cwd(), 'seed-assets');

  for (const doc of docs) {
    const caseNum = (doc as any).cases?.case_number || 'Case';
    const ver = (doc as any).document_versions;
    const storagePath = ver?.storage_path;
    const filename = storagePath ? path.basename(storagePath) : `${doc.title}.pdf`;

    let fileBuffer: Buffer | null = null;

    // Check local seed-assets first
    const localAssetPath = path.join(seedAssetsDir, filename);
    if (fs.existsSync(localAssetPath)) {
      fileBuffer = fs.readFileSync(localAssetPath);
    } else if (storagePath) {
      // Download from Supabase Storage
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from('case-documents')
        .download(storagePath);

      if (!dlErr && blob) {
        fileBuffer = Buffer.from(await blob.arrayBuffer());
      }
    }

    if (!fileBuffer) {
      console.warn(`⚠️ Could not retrieve bytes for document "${doc.title}", generating synthetic index text.`);
      fileBuffer = Buffer.from(`Official Case Document: ${doc.title}. Case: ${caseNum}. Sensitivity: ${doc.sensitivity_level}.`);
    }

    const chunkCount = await indexDocument(
      doc.id,
      doc.case_id,
      doc.sensitivity_level,
      fileBuffer,
      supabaseAdmin
    );

    totalChunks += chunkCount;
    console.log(`✓ Indexed "${doc.title}" (${caseNum}, Level ${doc.sensitivity_level}): ${chunkCount} chunks`);
  }

  // Verification count
  const { count: finalCount } = await supabaseAdmin
    .from('document_embeddings')
    .select('*', { count: 'exact', head: true });

  console.log('\n================================================================');
  console.log(`🎉 BACKFILL COMPLETE: ${docs.length} documents processed, ${finalCount || totalChunks} total embedding rows in database.`);
  console.log('================================================================\n');
}

runBackfill().catch((err) => {
  console.error('\n❌ Backfill Failed:', err);
  process.exit(1);
});
