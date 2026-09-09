import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

interface DemoUserConfig {
  email: string;
  name: string;
  role: 'officer' | 'supervisor' | 'admin' | 'judge';
}

interface DemoCaseConfig {
  caseNumber: string;
  title: string;
  status: 'open' | 'closed';
}

interface SeedPdfConfig {
  fileName: string;
  caseNumber: string;
  docType: string;
  title: string;
  sensitivityLevel: 'A' | 'B' | 'C';
}

const DEMO_USERS: DemoUserConfig[] = [
  { email: 'officer.demo@sdiil.test', name: 'Insp. Vikram Rathore', role: 'officer' },
  { email: 'supervisor.demo@sdiil.test', name: 'SP Sunita Sharma', role: 'supervisor' },
  { email: 'admin.demo@sdiil.test', name: 'System Administrator', role: 'admin' },
  { email: 'judge.demo@sdiil.test', name: 'Hon. Justice Rajesh Verma', role: 'judge' },
];

const DEMO_CASES: DemoCaseConfig[] = [
  {
    caseNumber: 'MH-PN-2026-0142',
    title: 'State of Maharashtra vs. Sandeep Shinde (Burglary & Property Recovery)',
    status: 'open',
  },
  {
    caseNumber: 'MH-PN-2026-0198',
    title: 'State of Maharashtra vs. Rajesh Kadam (Organized Syndicate Crime)',
    status: 'open',
  },
  {
    caseNumber: 'MH-PN-2026-0210',
    title: 'State of Maharashtra vs. Amit Deshmukh (Commercial Fraud Investigation)',
    status: 'closed',
  },
];

const SEED_PDFS: SeedPdfConfig[] = [
  // Case MH-PN-2026-0142 (Sensitivity B)
  {
    fileName: 'CourtOrder_MH-PN-2026-0142.pdf',
    caseNumber: 'MH-PN-2026-0142',
    docType: 'CourtOrder',
    title: 'Judicial Magistrate Court Order - Case MH-PN-2026-0142',
    sensitivityLevel: 'B',
  },
  {
    fileName: 'FIR_MH-PN-2026-0142.pdf',
    caseNumber: 'MH-PN-2026-0142',
    docType: 'FIR',
    title: 'FIR No. 142/2026 - Deccan Police Station',
    sensitivityLevel: 'B',
  },
  {
    fileName: 'Panchnama_MH-PN-2026-0142.pdf',
    caseNumber: 'MH-PN-2026-0142',
    docType: 'Panchnama',
    title: 'Spot Panchnama & Evidence Seizure Memo',
    sensitivityLevel: 'B',
  },

  // Case MH-PN-2026-0198 (Sensitivity A)
  {
    fileName: 'Chargesheet_MH-PN-2026-0198.pdf',
    caseNumber: 'MH-PN-2026-0198',
    docType: 'Chargesheet',
    title: 'Police Final Investigation Report (Chargesheet u/s 173 CrPC)',
    sensitivityLevel: 'A',
  },
  {
    fileName: 'FIR_MH-PN-2026-0198.pdf',
    caseNumber: 'MH-PN-2026-0198',
    docType: 'FIR',
    title: 'Special Crime Cell FIR No. 198/2026',
    sensitivityLevel: 'A',
  },
  {
    fileName: 'WitnessStatement_MH-PN-2026-0198.pdf',
    caseNumber: 'MH-PN-2026-0198',
    docType: 'WitnessStatement',
    title: 'Protected Witness Statement recorded u/s 161 CrPC',
    sensitivityLevel: 'A',
  },

  // Case MH-PN-2026-0210 (Sensitivity C)
  {
    fileName: 'CourtOrder_MH-PN-2026-0210.pdf',
    caseNumber: 'MH-PN-2026-0210',
    docType: 'CourtOrder',
    title: 'Court Summary Disposal & Closure Order',
    sensitivityLevel: 'C',
  },
  {
    fileName: 'FIR_MH-PN-2026-0210.pdf',
    caseNumber: 'MH-PN-2026-0210',
    docType: 'FIR',
    title: 'Closed Complaint FIR No. 210/2026',
    sensitivityLevel: 'C',
  },
];

const BUCKET_NAME = 'case-documents';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'DemoPass123!';

/**
 * Main database seed function for SDIIL backend.
 * Uses supabaseAdmin (service_role client) to bypass RLS for setup.
 */
async function runSeed() {
  console.log('====================================================');
  console.log('  SDIIL Database & Storage Seeding Routine');
  console.log('====================================================\n');

  // Step 1: Ensure Storage Bucket exists and is private
  console.log(`[1/7] Ensuring storage bucket "${BUCKET_NAME}" exists (private)...`);
  const { data: bucket, error: bucketError } = await supabaseAdmin.storage.getBucket(BUCKET_NAME);

  if (bucketError && bucketError.message.includes('not found')) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
      public: false,
    });
    if (createError) {
      throw new Error(`Failed to create bucket "${BUCKET_NAME}": ${createError.message}`);
    }
    console.log(`  ✓ Bucket "${BUCKET_NAME}" created successfully (public: false)`);
  } else if (bucket) {
    if (bucket.public) {
      console.log(`  ℹ Updating bucket "${BUCKET_NAME}" to private...`);
      await supabaseAdmin.storage.updateBucket(BUCKET_NAME, { public: false });
    }
    console.log(`  ✓ Bucket "${BUCKET_NAME}" verified (public: false)`);
  } else if (bucketError) {
    throw new Error(`Storage check error: ${bucketError.message}`);
  }

  // Step 2: Clean up previous demo data to ensure clean idempotency
  console.log('\n[2/7] Cleaning up existing demo data if any...');
  // Find existing demo users by email
  const { data: existingUsersData } = await supabaseAdmin.auth.admin.listUsers();
  const existingUsers = existingUsersData?.users || [];
  const demoEmails = DEMO_USERS.map((u) => u.email.toLowerCase());

  // Clean existing tables in reverse dependency order
  await supabaseAdmin.from('blockchain_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('documents').update({ current_version_id: null }).neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('document_versions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('case_assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('cases').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('abac_policies').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Delete existing demo auth users and profiles
  for (const user of existingUsers) {
    if (user.email && demoEmails.includes(user.email.toLowerCase())) {
      await supabaseAdmin.from('profiles').delete().eq('id', user.id);
      await supabaseAdmin.auth.admin.deleteUser(user.id);
    }
  }
  console.log('  ✓ Prior demo data cleaned up.');

  // Step 3: Create 4 Demo Users in Auth & Profiles
  console.log('\n[3/7] Creating 4 demo users in Auth & Profiles...');
  const userMap: Record<string, { id: string; email: string; role: string; name: string }> = {};

  for (const userConfig of DEMO_USERS) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: userConfig.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: userConfig.name,
        role: userConfig.role,
      },
    });

    if (authError || !authData.user) {
      throw new Error(`Failed to create Auth user ${userConfig.email}: ${authError?.message}`);
    }

    const userId = authData.user.id;
    userMap[userConfig.role] = {
      id: userId,
      email: userConfig.email,
      role: userConfig.role,
      name: userConfig.name,
    };

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userId,
      name: userConfig.name,
      role: userConfig.role,
      is_locked: false,
    });

    if (profileError) {
      throw new Error(`Failed to create profile for ${userConfig.email}: ${profileError.message}`);
    }

    console.log(`  ✓ User created: ${userConfig.role.padEnd(10)} | ${userConfig.email.padEnd(28)} | ID: ${userId}`);
  }

  // Step 4: Create 3 Demo Cases
  console.log('\n[4/7] Creating 3 demo cases...');
  const caseMap: Record<string, { id: string; caseNumber: string; status: string }> = {};
  const adminUserId = userMap['admin'].id;

  for (const caseConfig of DEMO_CASES) {
    const { data: caseRow, error: caseError } = await supabaseAdmin
      .from('cases')
      .insert({
        case_number: caseConfig.caseNumber,
        title: caseConfig.title,
        status: caseConfig.status,
        created_by: adminUserId,
      })
      .select('id, case_number, status')
      .single();

    if (caseError || !caseRow) {
      throw new Error(`Failed to create case ${caseConfig.caseNumber}: ${caseError?.message}`);
    }

    caseMap[caseConfig.caseNumber] = {
      id: caseRow.id,
      caseNumber: caseRow.case_number,
      status: caseRow.status,
    };

    console.log(`  ✓ Case created: ${caseConfig.caseNumber.padEnd(16)} | Status: ${caseConfig.status.padEnd(6)} | ID: ${caseRow.id}`);
  }

  // Step 5: Create Case Assignments
  console.log('\n[5/7] Creating case assignments...');
  // Officer & Supervisor assigned to all 3 cases
  // Judge assigned to MH-PN-2026-0198 only (Sensitivity-A case)
  const assignmentsToInsert: Array<{ case_id: string; user_id: string; role_in_case: string }> = [];

  for (const caseConfig of DEMO_CASES) {
    const caseId = caseMap[caseConfig.caseNumber].id;

    // Officer assignment
    assignmentsToInsert.push({
      case_id: caseId,
      user_id: userMap['officer'].id,
      role_in_case: 'investigating_officer',
    });

    // Supervisor assignment
    assignmentsToInsert.push({
      case_id: caseId,
      user_id: userMap['supervisor'].id,
      role_in_case: 'supervisory_officer',
    });
  }

  // Judge assignment (Sensitivity-A case only)
  const sensitivityACaseId = caseMap['MH-PN-2026-0198'].id;
  assignmentsToInsert.push({
    case_id: sensitivityACaseId,
    user_id: userMap['judge'].id,
    role_in_case: 'presiding_judge',
  });

  const { error: assignError } = await supabaseAdmin.from('case_assignments').insert(assignmentsToInsert);
  if (assignError) {
    throw new Error(`Failed to insert case assignments: ${assignError.message}`);
  }

  console.log(`  ✓ Officer assigned to 3 cases (MH-PN-2026-0142, MH-PN-2026-0198, MH-PN-2026-0210)`);
  console.log(`  ✓ Supervisor assigned to 3 cases (MH-PN-2026-0142, MH-PN-2026-0198, MH-PN-2026-0210)`);
  console.log(`  ✓ Judge assigned to 1 case (MH-PN-2026-0198 only)`);

  // Step 6: Upload 8 PDFs, Create documents, document_versions, & blockchain_events
  console.log('\n[6/7] Processing 8 seed PDFs (Hash, Upload, Document, Version, Blockchain Event)...');
  const seedAssetsDir = path.resolve(process.cwd(), 'seed-assets');
  let uploadedCount = 0;
  let blockchainEventsCount = 0;

  for (const item of SEED_PDFS) {
    const filePath = path.join(seedAssetsDir, item.fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Seed asset file missing: ${filePath}`);
    }

    // Read raw unmodified bytes in memory
    const fileBuffer = fs.readFileSync(filePath);

    // Compute SHA-256 hash on raw bytes before any storage/transformation (rule-hash-on-raw-bytes-before-encryption)
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const caseId = caseMap[item.caseNumber].id;
    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const versionNumber = 1;

    // Object key convention: case_docs/{case_id}/{document_id}/v{version_number}/{filename}
    const storagePath = `case_docs/${caseId}/${documentId}/v${versionNumber}/${item.fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload ${item.fileName} to storage: ${uploadError.message}`);
    }

    // Insert document record
    const { error: docInsertError } = await supabaseAdmin.from('documents').insert({
      id: documentId,
      case_id: caseId,
      title: item.title,
      doc_type: item.docType,
      sensitivity_level: item.sensitivityLevel,
      uploaded_by: userMap['officer'].id,
    });

    if (docInsertError) {
      throw new Error(`Failed to insert document ${item.title}: ${docInsertError.message}`);
    }

    // Insert document_versions record with raw SHA-256 hash
    const { error: verInsertError } = await supabaseAdmin.from('document_versions').insert({
      id: versionId,
      document_id: documentId,
      version_number: versionNumber,
      storage_path: storagePath,
      file_hash: fileHash,
      file_size_bytes: fileBuffer.length,
      uploaded_by: userMap['officer'].id,
    });

    if (verInsertError) {
      throw new Error(`Failed to insert document version for ${item.title}: ${verInsertError.message}`);
    }

    // Link current_version_id on documents table
    const { error: updateDocError } = await supabaseAdmin
      .from('documents')
      .update({ current_version_id: versionId })
      .eq('id', documentId);

    if (updateDocError) {
      throw new Error(`Failed to set current_version_id on document: ${updateDocError.message}`);
    }

    // Insert immutable blockchain_events registration record
    const mockTxHash = `0x${crypto.randomBytes(32).toString('hex')}`;
    const { error: bcInsertError } = await supabaseAdmin.from('blockchain_events').insert({
      document_version_id: versionId,
      event_type: 'hash_registered',
      tx_hash: mockTxHash,
      registered_hash: fileHash,
    });

    if (bcInsertError) {
      throw new Error(`Failed to insert blockchain event: ${bcInsertError.message}`);
    }

    uploadedCount++;
    blockchainEventsCount++;
    console.log(
      `  ✓ [Level ${item.sensitivityLevel}] ${item.fileName.padEnd(35)} -> ${storagePath.substring(0, 45)}... | Hash: ${fileHash.substring(0, 12)}...`
    );
  }

  // Step 7: Seed ABAC Policies
  console.log('\n[7/7] Seeding ABAC policies...');
  const abacPolicies = [
    // officer / A / view / no-dual-auth (assigned case only)
    {
      role: 'officer',
      sensitivity_level: 'A' as const,
      permission: 'view',
      requires_dual_auth: false,
      case_scope: 'assigned_only',
    },
    // officer / A / share / requires-dual-auth
    {
      role: 'officer',
      sensitivity_level: 'A' as const,
      permission: 'share',
      requires_dual_auth: true,
      case_scope: 'assigned_only',
    },
    // supervisor / A / share / requires-dual-auth (approver role)
    {
      role: 'supervisor',
      sensitivity_level: 'A' as const,
      permission: 'share',
      requires_dual_auth: true,
      case_scope: 'assigned_only',
    },
    // supervisor / A / view / no-dual-auth
    {
      role: 'supervisor',
      sensitivity_level: 'A' as const,
      permission: 'view',
      requires_dual_auth: false,
      case_scope: 'assigned_only',
    },
    // admin / * / * (all permissions, case_scope=all_cases for A, B, C)
    {
      role: 'admin',
      sensitivity_level: 'A' as const,
      permission: '*',
      requires_dual_auth: false,
      case_scope: 'all_cases',
    },
    {
      role: 'admin',
      sensitivity_level: 'B' as const,
      permission: '*',
      requires_dual_auth: false,
      case_scope: 'all_cases',
    },
    {
      role: 'admin',
      sensitivity_level: 'C' as const,
      permission: '*',
      requires_dual_auth: false,
      case_scope: 'all_cases',
    },
    // Standard baseline view/share policies for Level B & C
    {
      role: 'officer',
      sensitivity_level: 'B' as const,
      permission: 'view',
      requires_dual_auth: false,
      case_scope: 'assigned_only',
    },
    {
      role: 'officer',
      sensitivity_level: 'B' as const,
      permission: 'share',
      requires_dual_auth: false,
      case_scope: 'assigned_only',
    },
    {
      role: 'officer',
      sensitivity_level: 'C' as const,
      permission: 'view',
      requires_dual_auth: false,
      case_scope: 'assigned_only',
    },
    {
      role: 'officer',
      sensitivity_level: 'C' as const,
      permission: 'share',
      requires_dual_auth: false,
      case_scope: 'assigned_only',
    },
    {
      role: 'supervisor',
      sensitivity_level: 'B' as const,
      permission: 'view',
      requires_dual_auth: false,
      case_scope: 'assigned_only',
    },
    {
      role: 'supervisor',
      sensitivity_level: 'C' as const,
      permission: 'view',
      requires_dual_auth: false,
      case_scope: 'assigned_only',
    },
    {
      role: 'judge',
      sensitivity_level: 'A' as const,
      permission: 'view',
      requires_dual_auth: false,
      case_scope: 'assigned_only',
    },
  ];

  const { error: abacError } = await supabaseAdmin.from('abac_policies').insert(abacPolicies);
  if (abacError) {
    throw new Error(`Failed to insert ABAC policies: ${abacError.message}`);
  }
  console.log(`  ✓ Seeded ${abacPolicies.length} ABAC policies.`);

  // FINAL VERIFICATION & SUMMARY
  console.log('\n====================================================');
  console.log('              FINAL SEED VERIFICATION');
  console.log('====================================================');

  const { data: usersFinal } = await supabaseAdmin.auth.admin.listUsers();
  const demoUsersFinal = usersFinal?.users.filter((u) => demoEmails.includes(u.email?.toLowerCase() || '')) || [];
  console.log(`\n1. Users Created in Auth: ${demoUsersFinal.length}/4`);
  for (const u of demoUsersFinal) {
    console.log(`   • ${u.email} (ID: ${u.id})`);
  }

  const { data: casesFinal } = await supabaseAdmin.from('cases').select('id, case_number, status');
  const { data: assignmentsFinal } = await supabaseAdmin
    .from('case_assignments')
    .select('case_id, user_id, role_in_case');
  console.log(`\n2. Cases Created: ${casesFinal?.length}/3`);
  for (const c of casesFinal || []) {
    const count = assignmentsFinal?.filter((a) => a.case_id === c.id).length;
    console.log(`   • Case ${c.case_number} [${c.status}] -> ${count} assignments`);
  }

  const { data: docsFinal } = await supabaseAdmin
    .from('documents')
    .select('id, title, sensitivity_level, case_id');
  console.log(`\n3. Documents Created: ${docsFinal?.length}/8`);
  const levelCounts = (docsFinal || []).reduce((acc: Record<string, number>, d) => {
    acc[d.sensitivity_level] = (acc[d.sensitivity_level] || 0) + 1;
    return acc;
  }, {});
  console.log(`   • Level A: ${levelCounts['A'] || 0} (MH-PN-2026-0198)`);
  console.log(`   • Level B: ${levelCounts['B'] || 0} (MH-PN-2026-0142)`);
  console.log(`   • Level C: ${levelCounts['C'] || 0} (MH-PN-2026-0210)`);

  const { data: storageObjectsFinal } = await supabaseAdmin.storage.from(BUCKET_NAME).list('case_docs', {
    limit: 100,
    offset: 0,
  });
  console.log(`\n4. Storage Files in "${BUCKET_NAME}":`);
  console.log(`   • Successfully uploaded: ${uploadedCount}/8 PDF documents`);
  console.log(`   • Base path: case_docs/`);

  const { data: eventsFinal } = await supabaseAdmin.from('blockchain_events').select('id, registered_hash');
  console.log(`\n5. Blockchain Events Created: ${eventsFinal?.length}/8`);
  for (const ev of eventsFinal || []) {
    console.log(`   • Registered Hash: ${ev.registered_hash.substring(0, 24)}... (Event ID: ${ev.id})`);
  }

  console.log('\n====================================================');
  console.log('       SEEDING COMPLETED SUCCESSFULLY! ✨');
  console.log('====================================================\n');
}

runSeed().catch((err) => {
  console.error('\n❌ SEEDING FAILED WITH ERROR:');
  console.error(err);
  process.exit(1);
});
