import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

dotenv.config();
if (typeof __dirname !== 'undefined') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'sdiil-backend/.env') });

const BUCKET_NAME = 'case-documents';

/**
 * Generate synthetic PDF bytes matching the required ICJS synthetic specifications.
 */
function generateSyntheticPdf(doc: any, index: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const pdf = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      pdf.on('data', (chunk) => buffers.push(chunk));
      pdf.on('end', () => resolve(Buffer.concat(buffers)));
      pdf.on('error', (err) => reject(err));

      const docType = (doc.doc_type || 'INVESTIGATION_REPORT').toUpperCase();
      const meta = doc.metadata || {};
      const createdAtDate = doc.created_at ? new Date(doc.created_at) : new Date();
      const formattedDate = `${String(createdAtDate.getDate()).padStart(2, '0')}/${String(createdAtDate.getMonth() + 1).padStart(2, '0')}/${createdAtDate.getFullYear()}`;

      // Header on top of page
      pdf
        .fontSize(10)
        .fillColor('#D9534F')
        .text('SYNTHETIC SAMPLE - NOT A REAL DOCUMENT', { align: 'center' })
        .moveDown(0.5);

      pdf
        .strokeColor('#E0E0E0')
        .lineWidth(1)
        .moveTo(50, pdf.y)
        .lineTo(550, pdf.y)
        .stroke()
        .moveDown(1);

      pdf.fillColor('#1A202C');

      if (docType === 'FIR') {
        const firNo = meta.case_id_reference || `SYN-FIR-${String(index).padStart(4, '0')}`;
        pdf.fontSize(16).font('Helvetica-Bold').text('FIRST INFORMATION REPORT (SYNTHETIC)', { align: 'center' }).moveDown(1);
        pdf.fontSize(11).font('Helvetica');
        pdf.text(`FIR No: ${firNo}`);
        pdf.text(`Date: ${formattedDate}`);
        pdf.text(`Police Station: Hinjawadi Police Station (Synthetic)`);
        pdf.text(`District: Pune, Maharashtra`);
        pdf.text(`Complainant: [Synthetic Complainant Name]`);
        pdf.text(`Accused: [Synthetic Accused Name]`);
        pdf.text(`Sections: BNS Section 103, 115, 351`);
        pdf.text(`Investigating Officer: Inspector M. Deshmukh (Badge: SYN-1187)`);
        pdf.text(`Status: Under Investigation`);
        pdf.moveDown(1);
        pdf.text(`Brief Description: Synthetic FIR registered for testing and demonstration within the Secure Document Intelligence & Integrity Layer (SDIIL).`);
      } else if (docType === 'WITNESS_STATEMENT') {
        pdf.fontSize(16).font('Helvetica-Bold').text('STATEMENT OF WITNESS (U/S 161 CrPC / BNSS)', { align: 'center' }).moveDown(1);
        pdf.fontSize(11).font('Helvetica');
        pdf.text(`Statement No: WS-${String(index).padStart(3, '0')}`);
        pdf.text(`Case Reference: ${doc.case_id}`);
        pdf.text(`Date of Statement: ${doc.created_at || formattedDate}`);
        pdf.text(`Witness Details: [IDENTITY PROTECTED - SYNTHETIC]`);
        pdf.moveDown(1);
        pdf.text(
          `Statement: This is a synthetic witness statement generated for demonstration purposes. The witness states that on the date in question they observed [synthetic event description]. This document is not a real legal record.`
        );
        pdf.moveDown(1);
        pdf.text(`Magistrate: [Synthetic Magistrate Name], JMFC Pune`);
      } else if (docType === 'FORENSIC_REPORT') {
        pdf.fontSize(16).font('Helvetica-Bold').text('CENTRAL FORENSIC SCIENCE LABORATORY REPORT', { align: 'center' }).moveDown(1);
        pdf.fontSize(11).font('Helvetica');
        pdf.text(`CFSL Reference: CFSL-PUN-2026-${String(index).padStart(3, '0')}`);
        pdf.text(`Exhibit List: M-1 (Iron rod), M-2 (Mobile device)`);
        pdf.text(`Analysis: Synthetic forensic analysis results verifying electronic and physical evidence integrity.`);
        pdf.text(`Analyst: Dr. S. Kumar (Synthetic), CFSL Pune`);
        pdf.text(`Date: ${doc.created_at || formattedDate}`);
        pdf.moveDown(1);
        pdf.text(`Conclusion: Sealed evidence matches exemplar metrics with 99.9% statistical confidence.`);
      } else if (docType === 'CHARGE_SHEET' || docType === 'CHARGESHEET') {
        pdf.fontSize(16).font('Helvetica-Bold').text('POLICE FINAL REPORT / CHARGE SHEET', { align: 'center' }).moveDown(1);
        pdf.fontSize(11).font('Helvetica');
        pdf.text(`Case No: ${doc.case_id}`);
        pdf.text(`Under Sections: BNS 103, 115, 351, 61`);
        pdf.text(`Accused: [Synthetic Name]`);
        pdf.text(`IO: Inspector M. Deshmukh`);
        pdf.text(`Submitted to: JMFC Court Pune`);
        pdf.moveDown(1);
        pdf.text(`Summary: Prima facie charges submitted upon completion of preliminary evidentiary review.`);
      } else {
        // INVESTIGATION_REPORT or generic
        pdf.fontSize(16).font('Helvetica-Bold').text('INVESTIGATION PROGRESS REPORT', { align: 'center' }).moveDown(1);
        pdf.fontSize(11).font('Helvetica');
        pdf.text(`Case No: ${doc.case_id}`);
        pdf.text(`Investigation Period: ${formattedDate} to Present`);
        pdf.text(`Key Findings: Synthetic investigation findings documenting chain of custody and case events.`);
        pdf.text(`Status: Investigation Complete`);
        pdf.text(`Recommendations: [Synthetic recommendations for judicial submission]`);
      }

      // Add document title and id reference
      pdf.moveDown(2);
      pdf.fontSize(10).fillColor('#4A5568').font('Helvetica');
      pdf.text(`Document Title: ${doc.title || 'Untitled Evidence'}`);
      pdf.text(`Internal Vault ID: ${doc.id}`);
      pdf.text(`Sensitivity Clearance: Level ${doc.sensitivity_level || 'C'}`);

      // Footer
      pdf.moveDown(3);
      pdf
        .strokeColor('#E0E0E0')
        .lineWidth(1)
        .moveTo(50, 720)
        .lineTo(550, 720)
        .stroke();

      pdf
        .fontSize(9)
        .fillColor('#718096')
        .text('SYNTHETIC SAMPLE FOR DEMO PURPOSES ONLY — NOT AN OFFICIAL LEGAL DOCUMENT', 50, 730, {
          align: 'center',
          width: 500,
        });

      pdf.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Main reseed routine:
 * 1. Checks all ACTIVE documents
 * 2. Confirms storage presence
 * 3. Generates & uploads synthetic PDF if missing
 */
export async function reseedMissingDocuments() {
  console.log('--- Starting Storage Reseed Check for ACTIVE Documents ---');

  const { data: activeDocs, error: docErr } = await supabaseAdmin
    .from('documents')
    .select(`
      id,
      case_id,
      title,
      doc_type,
      sensitivity_level,
      status,
      created_at,
      current_version_id
    `)
    .eq('status', 'ACTIVE');

  if (docErr) {
    console.error('Failed to query ACTIVE documents:', docErr);
    process.exit(1);
  }

  const totalActive = activeDocs?.length || 0;
  console.log(`Found ${totalActive} ACTIVE documents in database.`);

  let reseededCount = 0;
  let verifiedExistingCount = 0;

  for (let i = 0; i < (activeDocs || []).length; i++) {
    const doc = activeDocs[i];
    let version: any = null;

    if (doc.current_version_id) {
      const { data: v } = await supabaseAdmin
        .from('document_versions')
        .select('*')
        .eq('id', doc.current_version_id)
        .maybeSingle();
      version = v;
    }

    // Determine storage path
    let storagePath = version?.storage_path;
    let needsUpload = false;

    if (!storagePath) {
      storagePath = `case_docs/${doc.case_id}/${doc.id}/v1/${(doc.title || 'document').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      needsUpload = true;
    } else {
      // Check if file exists in Supabase Storage
      const { data: signedData, error: signErr } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .createSignedUrl(storagePath, 60);

      if (signErr || !signedData?.signedUrl) {
        needsUpload = true;
      }
    }

    if (needsUpload) {
      console.log(`[Reseed] Generating synthetic PDF for doc ${doc.id} (${doc.title})...`);
      const pdfBytes = await generateSyntheticPdf(doc, i + 1);
      const fileHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');

      // Upload to Supabase Storage
      const { error: uploadErr } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(storagePath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadErr) {
        console.error(`[Reseed] Failed to upload ${storagePath}:`, uploadErr);
        continue;
      }

      // Ensure version record exists
      if (!version) {
        const { data: newVer, error: verErr } = await supabaseAdmin
          .from('document_versions')
          .insert({
            document_id: doc.id,
            version_number: 1,
            file_hash: fileHash,
            storage_path: storagePath,
            file_size_bytes: pdfBytes.length,
            uploaded_by: '16612cbd-7d24-4a4e-9238-c47a40ec645d', // Officer demo
          })
          .select('id')
          .single();

        if (!verErr && newVer) {
          await supabaseAdmin
            .from('documents')
            .update({ current_version_id: newVer.id })
            .eq('id', doc.id);
        }
      } else {
        await supabaseAdmin
          .from('document_versions')
          .update({
            storage_path: storagePath,
            file_hash: fileHash,
            file_size_bytes: pdfBytes.length,
          })
          .eq('id', version.id);
      }

      reseededCount++;
    } else {
      verifiedExistingCount++;
    }
  }

  console.log(`========================================`);
  console.log(`Storage Reseed Summary:`);
  console.log(`Total ACTIVE Documents in DB: ${totalActive}`);
  console.log(`Existing Verified in Storage: ${verifiedExistingCount}`);
  console.log(`Reseeded / Uploaded:         ${reseededCount}`);
  console.log(`========================================`);
}

// Run if executed directly
if (process.argv[1]?.endsWith('reseed-documents.ts')) {
  reseedMissingDocuments()
    .then(() => {
      console.log('Reseed check complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Reseed script failed:', err);
      process.exit(1);
    });
}
