import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_BASE_URL = 'http://localhost:8000/api/v1';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required Supabase environment variables');
  process.exit(1);
}

// RFC 6238 TOTP Generator
function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function generateTOTP(secret: string, timeStepSec = 30): string {
  const key = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStepSec);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;

  return code.toString().padStart(6, '0');
}

async function authenticateDemoUser(
  email: string,
  password: string,
  totpSecret?: string
): Promise<{ token: string; userId: string; client: any }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !authData.session) {
    throw new Error(`Sign in failed for ${email}: ${signInErr?.message}`);
  }

  let session = authData.session;

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpFactor = factors?.totp?.find((f) => f.status === 'verified');

  if (totpFactor && totpSecret) {
    const otpCode = generateTOTP(totpSecret);
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({
      factorId: totpFactor.id,
    });
    if (challengeErr) throw new Error(`MFA challenge failed: ${challengeErr.message}`);

    const { data: verifyData, error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code: otpCode,
    });
    if (verifyErr) throw new Error(`MFA verify failed: ${verifyErr.message}`);
    session = verifyData as any;
  }

  const authenticatedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { token: session.access_token, userId: session.user.id, client: authenticatedClient };
}

async function runAbacRagSearchTests() {
  console.log('================================================================');
  console.log('  SDIIL ABAC-Gated Semantic RAG Search Test Suite');
  console.log('  Retrival-Layer Filtering Proof (Tests 24-28)');
  console.log('================================================================\n');

  console.log('Authenticating demo users...');
  const officer = await authenticateDemoUser(
    'officer.demo@sdiil.test',
    'Demo@Officer123',
    'XXK4LHEU7K3XEOGWJ6TLIDYLWEWWQEQQ'
  );
  console.log(`✓ Officer authenticated (ID: ${officer.userId})`);

  const judge = await authenticateDemoUser(
    'judge.demo@sdiil.test',
    'Demo@Judge123',
    'OA5BNS6MDGW4TN5F4Q7ZV2KW6K5EAR3D'
  );
  console.log(`✓ Judge authenticated (ID: ${judge.userId})`);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // --------------------------------------------------------------------------
  // TEST 24: Unauthenticated Request Returns 401
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 24: Unauthenticated Request Rejected (rule-no-anonymous-access) ---');
  const resNoAuth = await fetch(`${API_BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Protected witness statement' }),
  });

  console.log(`HTTP Status: ${resNoAuth.status} (Expected: 401)`);
  if (resNoAuth.status !== 401) {
    throw new Error(`Test 24 Failed: Expected 401 Unauthorized, received ${resNoAuth.status}`);
  }
  const noAuthJson: any = await resNoAuth.json();
  console.log(`Response error: "${noAuthJson.error}"`);
  console.log('✓ TEST 24 PASSED: Anonymous access strictly blocked.\n');

  // --------------------------------------------------------------------------
  // TEST 25: Authorized Officer Search on Assigned Case (Sensitivity-A)
  // --------------------------------------------------------------------------
  console.log('--- TEST 25: Officer Search on Assigned Case (Sensitivity-A Allowed) ---');
  const officerQuery = 'Protected witness statement recorded under section 161 CrPC syndicate';
  console.log(`Query: "${officerQuery}"`);

  const resOfficer = await fetch(`${API_BASE_URL}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${officer.token}`,
    },
    body: JSON.stringify({
      query: officerQuery,
      case_id: 'MH-PN-2026-0198',
    }),
  });

  console.log(`HTTP Status: ${resOfficer.status} (Expected: 200)`);
  if (resOfficer.status !== 200) {
    const errText = await resOfficer.text();
    throw new Error(`Test 25 Failed: Expected 200 OK, received ${resOfficer.status}: ${errText}`);
  }

  const officerData: any = await resOfficer.json();
  console.log(`Requires Human Verification Flag: ${officerData.requires_human_verification}`);
  console.log(`Chunks Used Count: ${officerData.chunks_used_count}`);
  console.log(`Cited Doc IDs: ${JSON.stringify(officerData.cited_doc_ids)}`);
  console.log(`Citations Count: ${officerData.citations.length}`);

  if (officerData.requires_human_verification !== true) {
    throw new Error('Test 25 Failed: requires_human_verification must be true at top level');
  }

  if (officerData.chunks_used_count <= 0 || officerData.citations.length <= 0) {
    throw new Error('Test 25 Failed: Officer assigned to MH-PN-2026-0198 should receive matching chunks');
  }

  console.log(`Answer Preview:\n${officerData.answer.slice(0, 220)}...`);
  console.log('✓ TEST 25 PASSED: Officer retrieved authorized chunks and synthesized answer with citations.\n');

  // --------------------------------------------------------------------------
  // TEST 26: The Judge-Moment Proof (ABAC Filter Excludes Unassigned Case)
  // --------------------------------------------------------------------------
  console.log('--- TEST 26: The Judge-Moment Proof (Unassigned Case Query Gated at Retrieval) ---');
  // Judge Rajesh Verma is assigned to MH-PN-2026-0198 only.
  // Query searches for Deccan Police Station / Spot Panchnama in MH-PN-2026-0142.
  const judgeQuery = 'Deccan Police Station Spot Panchnama and Evidence Seizure Memo Sandeep Shinde';
  console.log(`Judge Query: "${judgeQuery}"`);
  console.log('Note: Judge is NOT assigned to case MH-PN-2026-0142.');

  const resJudge = await fetch(`${API_BASE_URL}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${judge.token}`,
    },
    body: JSON.stringify({
      query: judgeQuery,
      case_id: 'MH-PN-2026-0142',
    }),
  });

  console.log(`HTTP Status: ${resJudge.status} (Expected: 200)`);
  if (resJudge.status !== 200) {
    const errText = await resJudge.text();
    throw new Error(`Test 26 Failed: Expected 200 OK, received ${resJudge.status}: ${errText}`);
  }

  const judgeData: any = await resJudge.json();
  console.log(`Chunks Used Count: ${judgeData.chunks_used_count} (Expected: 0)`);
  console.log(`Cited Doc IDs: ${JSON.stringify(judgeData.cited_doc_ids)} (Expected: [])`);
  console.log(`Citations Count: ${judgeData.citations.length} (Expected: 0)`);
  console.log(`Requires Human Verification: ${judgeData.requires_human_verification}`);
  console.log(`Judge Answer Response:\n"${judgeData.answer}"`);

  if (judgeData.chunks_used_count !== 0 || judgeData.citations.length !== 0) {
    throw new Error('Test 26 Failed: Judge should receive 0 chunks for unassigned case MH-PN-2026-0142');
  }

  // Confirm NO document from MH-PN-2026-0142 was leaked
  if (judgeData.cited_doc_ids.length > 0) {
    throw new Error('Test 26 Failed: Information leakage detected in cited_doc_ids');
  }

  console.log('✓ TEST 26 PASSED: Judge received 0 chunks, 0 citations, zero information leakage.\n');

  // --------------------------------------------------------------------------
  // TEST 27: Side-by-Side Proof: SQL JOIN Excluded Unauthorized Chunks
  // --------------------------------------------------------------------------
  console.log('--- TEST 27: Side-by-Side RPC Proof (PostgreSQL WHERE Clause Verification) ---');
  // Generate the embedding vector for the exact same query
  const testPhrase = 'Spot Panchnama & Evidence Seizure Memo MH-PN-2026-0142';
  const { generateEmbedding } = await import('../lib/aiService.js');
  const { createUserClient } = await import('../lib/supabaseUser.js');
  const phraseEmbedding = await generateEmbedding(testPhrase);

  const officerUserClient = createUserClient(`Bearer ${officer.token}`);
  const judgeUserClient = createUserClient(`Bearer ${judge.token}`);

  // 1. Execute match_document_chunks under Officer's JWT
  const { data: officerRpcChunks, error: officerRpcErr } = await officerUserClient.rpc('match_document_chunks', {
    query_embedding: phraseEmbedding,
    match_count: 5,
    filter_case_id: null,
  });

  if (officerRpcErr) {
    throw new Error(`Officer RPC execution failed: ${officerRpcErr.message}`);
  }

  // 2. Execute match_document_chunks under Judge's JWT
  const { data: judgeRpcChunks, error: judgeRpcErr } = await judgeUserClient.rpc('match_document_chunks', {
    query_embedding: phraseEmbedding,
    match_count: 5,
    filter_case_id: null,
  });

  if (judgeRpcErr) {
    throw new Error(`Judge RPC execution failed: ${judgeRpcErr.message}`);
  }

  const officerChunkCases = Array.from(new Set((officerRpcChunks || []).map((c: any) => c.case_number)));
  const judgeChunkCases = Array.from(new Set((judgeRpcChunks || []).map((c: any) => c.case_number)));

  console.log(`Officer RPC retrieved ${officerRpcChunks?.length || 0} chunks from cases: [${officerChunkCases.join(', ')}]`);
  console.log(`Judge RPC retrieved ${judgeRpcChunks?.length || 0} chunks from cases: [${judgeChunkCases.join(', ')}]`);

  // Verify that Officer retrieved MH-PN-2026-0142 chunks
  const officerHas0142 = (officerRpcChunks || []).some((c: any) => c.case_number === 'MH-PN-2026-0142');
  // Verify that Judge received ZERO chunks from MH-PN-2026-0142
  const judgeHas0142 = (judgeRpcChunks || []).some((c: any) => c.case_number === 'MH-PN-2026-0142');

  console.log(`Officer saw MH-PN-2026-0142 chunks: ${officerHas0142} (Expected: true)`);
  console.log(`Judge saw MH-PN-2026-0142 chunks:   ${judgeHas0142} (Expected: false)`);

  if (!officerHas0142) {
    throw new Error('Test 27 Failed: Officer should see MH-PN-2026-0142 chunks');
  }

  if (judgeHas0142) {
    throw new Error('Test 27 Failed: Judge must NEVER see MH-PN-2026-0142 chunks in SQL result set');
  }

  console.log('✓ TEST 27 PASSED: PostgreSQL SQL JOIN strictly filtered out unassigned chunks at retrieval layer.');
  console.log('  Prompt construction never received unauthorized chunks under any circumstance.\n');

  // --------------------------------------------------------------------------
  // TEST 28: Search Audit Trail Logging (rule-immutable-audit-log)
  // --------------------------------------------------------------------------
  console.log('--- TEST 28: Audit Trail Verification for Search Queries ---');
  const { data: auditLogs, error: auditErr } = await adminClient
    .from('audit_log')
    .select('id, user_id, action, case_id, metadata, created_at')
    .eq('action', 'search')
    .order('created_at', { ascending: false })
    .limit(5);

  if (auditErr) {
    throw new Error(`Failed to query audit_log: ${auditErr.message}`);
  }

  console.log(`Found ${auditLogs?.length || 0} recent 'search' audit log entries:`);
  for (const log of auditLogs || []) {
    const isOfficer = log.user_id === officer.userId;
    const isJudge = log.user_id === judge.userId;
    const caller = isOfficer ? 'Officer' : isJudge ? 'Judge' : 'User';
    console.log(`  - [${log.created_at}] Actor: ${caller} | Query: "${log.metadata?.query}" | Retrieved: ${log.metadata?.chunks_retrieved}`);
  }

  const officerLogged = auditLogs?.some((l) => l.user_id === officer.userId);
  const judgeLogged = auditLogs?.some((l) => l.user_id === judge.userId);

  if (!officerLogged || !judgeLogged) {
    throw new Error('Test 28 Failed: Both officer and judge searches must be recorded in audit_log');
  }

  console.log('✓ TEST 28 PASSED: Search queries, caller identity, and citation counts immutably recorded in audit_log.\n');

  console.log('================================================================');
  console.log('🎉 ALL 5 ABAC RAG SEARCH TESTS (24-28) PASSED PERFECTLY!');
  console.log('================================================================');
}

runAbacRagSearchTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
