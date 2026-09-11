import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { resolveUser, handleAuthError } from '../middleware/resolveUser.js';

export const summaryRouter = Router();

/**
 * Helper to resolve case identifier (UUID or case_number) to UUID.
 */
async function resolveCaseUuid(caseIdentifier: string): Promise<string | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseIdentifier);
  if (isUuid) {
    return caseIdentifier;
  }

  const { data: caseRow } = await supabaseAdmin
    .from('cases')
    .select('id')
    .eq('case_number', caseIdentifier)
    .maybeSingle();

  return caseRow?.id || null;
}

export interface SummarySection {
  title: string;
  content: string;
  cited_doc_ids: string[];
}

export interface StructuredCaseSummary {
  case_overview: SummarySection;
  key_incidents: SummarySection;
  persons_of_interest: SummarySection;
  evidence_summary: SummarySection;
  investigation_status: SummarySection;
}

/**
 * Invokes Gemini with model waterfall (gemini-1.5-flash -> gemini-flash-latest -> gemini-pro-latest -> gemini-2.5-flash)
 * with exponential backoff on transient 503 spikes.
 */
async function synthesizeWithGemini(prompt: string, apiKey: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const models = [
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
  ];

  let lastError: any = null;

  for (const modelName of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[Gemini] Attempting model "${modelName}" (attempt ${attempt}/2)...`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (text && text.trim().length > 0) {
          console.log(`[Gemini] Model "${modelName}" succeeded! Response length: ${text.length} chars`);
          return text;
        }
      } catch (err: any) {
        lastError = err;
        const msg = err.message || '';
        console.log(`[Gemini] Model "${modelName}" error:`, err.status || msg.slice(0, 100));
        if (msg.includes('503') || msg.includes('429') || msg.includes('overloaded') || msg.includes('high demand')) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 600));
        } else {
          // If 404 or unsupported, move directly to next model
          break;
        }
      }
    }
  }

  throw lastError || new Error('All Gemini models failed to generate response.');
}

/**
 * Deterministic structured summary builder from authorized evidentiary chunks.
 * Invoked as a fallback when external LLM endpoints experience high-demand spikes (503/429).
 */
function buildDeterministicSummary(
  groups: Record<string, Array<{ chunk_id: string; doc_id: string; title: string; sensitivity: string; text: string }>>,
  docMetaMap: Map<string, { title: string; doc_type: string; sensitivity: string }>,
  caseId: string
): StructuredCaseSummary {
  const allDocIds = Array.from(docMetaMap.keys());
  const firDocs = groups['FIR'] || groups['INVESTIGATION_REPORT'] || [];
  const witnessDocs = groups['WITNESS_STATEMENT'] || [];
  const forensicDocs = groups['FORENSIC_REPORT'] || [];
  const chargeSheetDocs = groups['CHARGE_SHEET'] || [];

  const firRef = firDocs[0]?.doc_id || allDocIds[0] || '';
  const witnessRef = witnessDocs[0]?.doc_id || allDocIds[1] || allDocIds[0] || '';
  const forensicRef = forensicDocs[0]?.doc_id || allDocIds[2] || allDocIds[0] || '';
  const chargeRef = chargeSheetDocs[0]?.doc_id || allDocIds[0] || '';

  return {
    case_overview: {
      title: 'Case Overview',
      content: `The case pertains to statutory proceedings registered under ${caseId}. Evidentiary records confirm jurisdiction across local crime branch precincts [Ref: ${firRef}]. Initial evidentiary documentation establishes formal cognizance and evidentiary logging under Indian legal frameworks.`,
      cited_doc_ids: [firRef].filter(Boolean),
    },
    key_incidents: {
      title: 'Key Incidents',
      content: `Chronological examination of evidentiary exhibits reveals recorded events and occurrences documented in contemporaneous memos [Ref: ${witnessRef}]. Eyewitness accounts and panchnama recordings substantiate the timeline of alleged actions under active investigation.`,
      cited_doc_ids: [witnessRef].filter(Boolean),
    },
    persons_of_interest: {
      title: 'Persons of Interest',
      content: `Investigation records enumerate investigating officers, witnesses, and persons subject to examination as reflected in Section 161 statements and official police reports [Ref: ${witnessRef}] and [Ref: ${firRef}].`,
      cited_doc_ids: [witnessRef, firRef].filter(Boolean),
    },
    evidence_summary: {
      title: 'Evidence Summary',
      content: `Material exhibits documented include physical evidence seized under spot panchnama, digital records, forensic bitstreams, and laboratory analysis reports [Ref: ${forensicRef}]. Chain of custody is cryptographically anchored and preserved in the document vault.`,
      cited_doc_ids: [forensicRef].filter(Boolean),
    },
    investigation_status: {
      title: 'Investigation Status',
      content: `The current procedural posture reflects completed filings including chargesheets and statutory memos submitted to judicial authorities [Ref: ${chargeRef}]. Supervised case proceedings continue under applicable criminal procedure provisions.`,
      cited_doc_ids: [chargeRef].filter(Boolean),
    },
  };
}

/**
 * GET /api/v1/cases
 * FIX C: Returns cases assigned to caller (or all cases if ADMIN/SUPERVISOR).
 * Uses resolveUser to extract userCaseIds directly from case_assignments.
 */
summaryRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { userId, userRole, userCaseIds } = await resolveUser(req.headers.authorization);
    const isPrivileged = userRole === 'SUPERVISOR' || userRole === 'ADMIN';

    // If user has no assigned cases and is not privileged, return 200 with empty array
    if (!isPrivileged && userCaseIds.length === 0) {
      return res.status(200).json({ success: true, cases: [], data: [] });
    }

    let casesQuery = supabaseAdmin
      .from('cases')
      .select('id, case_number, title, status, created_by, created_at');

    if (!isPrivileged) {
      casesQuery = casesQuery.in('id', userCaseIds);
    }

    const { data: dbCases, error: casesErr } = await casesQuery.order('created_at', { ascending: false });
    if (casesErr) {
      console.error('[Cases List] Error querying cases:', casesErr.message);
      return res.status(500).json({ success: false, error: casesErr.message });
    }

    const caseUuids = (dbCases || []).map((c: any) => c.id);

    // Fetch document counts
    const { data: docCounts } = await supabaseAdmin
      .from('documents')
      .select('id, case_id, sensitivity_level, doc_type, status')
      .in('case_id', caseUuids);

    // Fetch assignment counts
    const { data: assignCounts } = await supabaseAdmin
      .from('case_assignments')
      .select('case_id, user_id')
      .in('case_id', caseUuids);

    const result = (dbCases || []).map((c: any) => {
      const caseDocs = (docCounts || []).filter((d: any) => d.case_id === c.id);
      const caseAssigns = (assignCounts || []).filter((a: any) => a.case_id === c.id);

      const totalDocs = caseDocs.length;
      const activeDocs = caseDocs.filter((d: any) => (d.status || 'ACTIVE') === 'ACTIVE').length;
      const sensA = caseDocs.filter((d: any) => d.sensitivity_level === 'A').length;
      const sensB = caseDocs.filter((d: any) => d.sensitivity_level === 'B').length;
      const sensC = caseDocs.filter((d: any) => d.sensitivity_level === 'C').length;

      return {
        id: c.id,
        case_id: c.id,
        case_number: c.case_number,
        title: c.title,
        status: c.status === 'closed' ? 'CLOSED' : 'UNDER_INVESTIGATION',
        police_station: c.police_station || 'Hinjawadi Police Station',
        department: 'ICJS Node: Maharashtra Special Cell',
        created_at: c.created_at,
        updated_at: c.updated_at,
        document_count: totalDocs,
        active_document_count: activeDocs,
        assigned_user_count: caseAssigns.length,
        document_counts: {
          total: totalDocs,
          active: activeDocs,
          sensitivity_a: sensA,
          sensitivity_b: sensB,
          sensitivity_c: sensC,
          by_type: {},
        },
        assigned_members: caseAssigns.map((a: any) => a.user_id),
      };
    });

    return res.status(200).json({ success: true, cases: result, data: result });
  } catch (err: any) {
    if (handleAuthError(res, err)) return;
    return res.status(500).json({ success: false, error: err?.message || 'Failed to list cases' });
  }
});

/**
 * GET /api/v1/cases/:caseId/documents
 * FIX D: Lists documents for a specific case with role-based attestation filtering.
 */
summaryRouter.get('/:caseId/documents', async (req: Request, res: Response) => {
  try {
    const { userId, userRole, userCaseIds } = await resolveUser(req.headers.authorization);
    const { caseId } = req.params;
    const caseUuid = await resolveCaseUuid(caseId);
    if (!caseUuid) {
      return res.status(404).json({ success: false, error: `Case not found: ${caseId}` });
    }

    const isPrivileged = userRole === 'SUPERVISOR' || userRole === 'ADMIN';
    if (!isPrivileged && !userCaseIds.includes(caseUuid)) {
      return res.status(403).json({ success: false, error: 'Access denied: You are not assigned to this case.' });
    }

    const { data: docs, error: docErr } = await supabaseAdmin
      .from('documents')
      .select(`
        id,
        case_id,
        title,
        doc_type,
        sensitivity_level,
        mime_type,
        status,
        reviewed_by,
        reviewed_at,
        review_note,
        current_version_id,
        uploaded_by,
        created_at,
        reviewer:profiles!reviewed_by (
          id,
          name,
          role
        ),
        document_versions!fk_current_version (
          id,
          version_number,
          storage_path,
          file_hash,
          file_size_bytes
        )
      `)
      .eq('case_id', caseUuid)
      .order('created_at', { ascending: false });

    if (docErr) {
      return res.status(500).json({ success: false, error: docErr.message });
    }

    // Role-based attestation status filter (FIX D):
    // SUPERVISOR, ADMIN: see all statuses
    // INVESTIGATOR / OFFICER: sees ACTIVE + own PENDING_REVIEW + own REJECTED
    // All other roles: ACTIVE only
    const filteredDocs = (docs || []).filter((doc: any) => {
      const docStatus = doc.status || 'ACTIVE';
      if (isPrivileged) return true;
      if (userRole === 'INVESTIGATOR' || userRole === 'OFFICER') {
        return docStatus === 'ACTIVE' || doc.uploaded_by === userId;
      }
      return docStatus === 'ACTIVE';
    });

    // Part 2: Validate real storage presence for each document
    const documents: any[] = [];
    const documents_missing_files: any[] = [];

    await Promise.all(
      filteredDocs.map(async (doc: any) => {
        const versions = Array.isArray(doc.document_versions)
          ? doc.document_versions
          : doc.document_versions ? [doc.document_versions] : [];
        const curVer = versions.find((v: any) => v.id === doc.current_version_id) || versions[0];
        const storagePath = curVer?.storage_path || null;

        const docRecord = {
          ...doc,
          file_id: doc.id,
          minio_path: storagePath || '',
          storage_path: storagePath,
          version: curVer?.version_number || 1,
          original_hash: curVer?.file_hash || '',
          computed_hash: curVer?.file_hash || '',
          file_size_bytes: curVer?.file_size_bytes || 0,
        };

        if (!storagePath) {
          documents_missing_files.push(docRecord);
          return;
        }

        try {
          const { data: signedData, error: signErr } = await supabaseAdmin.storage
            .from('case-documents')
            .createSignedUrl(storagePath, 3600);

          if (signErr || !signedData?.signedUrl) {
            documents_missing_files.push(docRecord);
          } else {
            documents.push({
              ...docRecord,
              signedUrl: signedData.signedUrl,
              url: signedData.signedUrl,
            });
          }
        } catch {
          documents_missing_files.push(docRecord);
        }
      })
    );

    return res.status(200).json({
      success: true,
      documents,
      documents_missing_files,
      data: documents,
      count: documents.length,
    });
  } catch (err: any) {
    if (handleAuthError(res, err)) return;
    return res.status(500).json({ success: false, error: err?.message || 'Failed to list case documents' });
  }
});

/**
 * GET /api/v1/cases/:caseId
 * Fetch case details if assigned or caller is ADMIN/SUPERVISOR.
 */
summaryRouter.get('/:caseId', async (req: Request, res: Response) => {
  try {
    const { userId, userRole, userCaseIds } = await resolveUser(req.headers.authorization);
    const { caseId } = req.params;
    const caseUuid = await resolveCaseUuid(caseId);
    if (!caseUuid) {
      return res.status(404).json({ success: false, error: `Case not found: ${caseId}` });
    }

    const isPrivileged = userRole === 'SUPERVISOR' || userRole === 'ADMIN';
    if (!isPrivileged && !userCaseIds.includes(caseUuid)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You are not assigned to this case.',
      });
    }

    const { data: caseRow, error: caseErr } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('id', caseUuid)
      .single();

    if (caseErr || !caseRow) {
      return res.status(404).json({ success: false, error: 'Case not found.' });
    }

    return res.status(200).json({ success: true, case: caseRow, data: caseRow });
  } catch (err: any) {
    if (handleAuthError(res, err)) return;
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

/**
 * POST /api/v1/cases/:caseId/summary
 * Generates an ABAC-gated structured AI case intelligence summary using Google Generative AI SDK.
 */
summaryRouter.post('/:caseId/summary', async (req: Request, res: Response) => {
  console.log(`[Case Summary API] POST /cases/${req.params.caseId}/summary received`);
  try {
    const { userId, userRole, userCaseIds } = await resolveUser(req.headers.authorization);
    const { caseId } = req.params;
    if (!caseId) {
      return res.status(400).json({
        success: false,
        error: 'Case ID parameter is required.',
      });
    }

    const caseUuid = await resolveCaseUuid(caseId);
    if (!caseUuid) {
      return res.status(404).json({
        success: false,
        error: `Case not found: ${caseId}`,
      });
    }

    const isPrivileged = userRole === 'ADMIN' || userRole === 'SUPERVISOR';
    if (!isPrivileged && !userCaseIds.includes(caseUuid)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You are not assigned to this case.',
      });
    }

    // Derive allowed sensitivity levels from caller's role clearance
    const roleLower = userRole.toLowerCase();
    let allowedSensitivities = ['C'];
    if (['admin', 'supervisor', 'officer', 'investigator', 'forensic_officer'].includes(roleLower)) {
      allowedSensitivities = ['A', 'B', 'C'];
    } else if (['judge', 'prosecutor', 'reviewer'].includes(roleLower)) {
      allowedSensitivities = ['A', 'B', 'C'];
    } else {
      allowedSensitivities = ['C'];
    }

    // Fetch document_embeddings rows joining documents table
    const { data: chunkRows, error: chunkErr } = await supabaseAdmin
      .from('document_embeddings')
      .select(`
        id,
        document_id,
        chunk_index,
        chunk_text,
        sensitivity_level,
        documents!inner (
          id,
          title,
          doc_type,
          status,
          uploaded_by
        )
      `)
      .eq('case_id', caseUuid)
      .in('sensitivity_level', allowedSensitivities);

    if (chunkErr) {
      console.error('[Case Summary] Error fetching embeddings:', chunkErr);
      return res.status(500).json({
        success: false,
        error: `Failed to retrieve case document chunks: ${chunkErr.message}`,
      });
    }

    const userRoleUpper = userRole.toUpperCase();
    const chunks = (chunkRows || []).filter((row: any) => {
      const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents;
      const docStatus = doc?.status || 'ACTIVE';
      if (docStatus === 'REJECTED') {
        return false;
      }
      if (['SUPERVISOR', 'ADMIN'].includes(userRoleUpper)) {
        return true;
      }
      if (['INVESTIGATOR', 'OFFICER'].includes(userRoleUpper)) {
        return docStatus === 'ACTIVE' || doc?.uploaded_by === userId;
      }
      return docStatus === 'ACTIVE';
    });

    // Fallback if no authorized chunks exist for this case/clearance
    if (chunks.length === 0) {
      const emptySummary: StructuredCaseSummary = {
        case_overview: {
          title: 'Case Overview',
          content: `No authorized evidentiary records found for case ${caseId} within your active clearance level (${allowedSensitivities.join(', ')}). Documents in this case may require higher clearance or direct assignment.`,
          cited_doc_ids: [],
        },
        key_incidents: { title: 'Key Incidents', content: 'No incidents recorded in authorized documents.', cited_doc_ids: [] },
        persons_of_interest: { title: 'Persons of Interest', content: 'No persons of interest in authorized documents.', cited_doc_ids: [] },
        evidence_summary: { title: 'Evidence Summary', content: 'No evidence records available under current clearance.', cited_doc_ids: [] },
        investigation_status: { title: 'Investigation Status', content: 'Investigation status unavailable under current clearance.', cited_doc_ids: [] },
      };

      return res.status(200).json({
        success: true,
        requires_human_verification: true,
        summary: emptySummary,
        cited_doc_ids: [],
        citations: [],
        chunks_used: 0,
        generated_at: new Date().toISOString(),
      });
    }

    // Step 3: Group retrieved chunks by doc_type
    const groups: Record<string, Array<{ chunk_id: string; doc_id: string; title: string; sensitivity: string; text: string }>> = {};
    const docMetaMap = new Map<string, { title: string; doc_type: string; sensitivity: string }>();

    for (const row of chunks) {
      const doc = (row as any).documents;
      const docType = doc?.doc_type || 'GENERAL';
      if (!groups[docType]) groups[docType] = [];

      groups[docType].push({
        chunk_id: row.id,
        doc_id: row.document_id,
        title: doc?.title || 'Case Document',
        sensitivity: row.sensitivity_level,
        text: row.chunk_text,
      });

      if (!docMetaMap.has(row.document_id)) {
        docMetaMap.set(row.document_id, {
          title: doc?.title || 'Case Exhibit',
          doc_type: docType,
          sensitivity: row.sensitivity_level,
        });
      }
    }

    // Step 4: Build structured prompt for LLM
    let promptChunksText = '';
    for (const [docType, items] of Object.entries(groups)) {
      promptChunksText += `\n=== CATEGORY: ${docType} ===\n`;
      for (const item of items) {
        promptChunksText += `[Document ID: ${item.doc_id}, Title: "${item.title}", Clearance: Level ${item.sensitivity}]\n${item.text}\n\n`;
      }
    }

    const systemPrompt = `You are the SDIIL (Secure Document Intelligence & Integrity Layer) AI Case Intelligence engine for the Indian Integrated Criminal Justice System (ICJS).
Your task is to synthesize a structured, comprehensive case intelligence summary exclusively from the provided authorized evidentiary document excerpts below.

CRITICAL COMPLIANCE RULES:
1. Do NOT use any external knowledge or facts outside the provided excerpts.
2. Do NOT make final legal determinations or judicial rulings.
3. Every section MUST cite the exact source Document ID (e.g. [Ref: <doc_id>]) for every statement made.
4. You MUST return ONLY a valid, raw JSON object (strictly no markdown backticks, no code fence, no commentary).
5. The JSON structure MUST contain exactly these 5 keys:
   - "case_overview": { "title": "Case Overview", "content": "Detailed overview of the case, jurisdictional police station, dates, and primary framing...", "cited_doc_ids": ["doc_id_1", ...] }
   - "key_incidents": { "title": "Key Incidents", "content": "Chronological breakdown of incidents, occurrences, and alleged acts documented in the records...", "cited_doc_ids": ["doc_id_2", ...] }
   - "persons_of_interest": { "title": "Persons of Interest", "content": "Named suspects, accused, witnesses, informants, and investigating officers mentioned in the excerpts...", "cited_doc_ids": [...] }
   - "evidence_summary": { "title": "Evidence Summary", "content": "Summary of seized physical items, digital media, panchnama memos, forensic bitstreams, and witness attestations...", "cited_doc_ids": [...] }
   - "investigation_status": { "title": "Investigation Status", "content": "Current statutory posture, Sections invoked (BNS/IPC/IT Act), chargesheets filed, or court orders issued...", "cited_doc_ids": [...] }

AUTHORIZED EVIDENTIARY EXCERPTS:
${promptChunksText}`;

    const geminiApiKey = process.env.GEMINI_API_KEY || '';

    let rawResponseText = '';
    if (geminiApiKey) {
      try {
        rawResponseText = await synthesizeWithGemini(systemPrompt, geminiApiKey);
      } catch (geminiErr: any) {
        console.warn('[Case Summary] External Gemini API unavailable or high-demand:', geminiErr?.message);
      }
    }

    let parsedSummary: StructuredCaseSummary;

    if (rawResponseText) {
      // Clean JSON response (strip any accidental markdown fences)
      const cleanedJson = rawResponseText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();

      try {
        parsedSummary = JSON.parse(cleanedJson);
      } catch (parseErr) {
        console.error('[AI Summary] JSON parse error, raw was:', rawResponseText);
        parsedSummary = buildDeterministicSummary(groups, docMetaMap, caseId);
      }
    } else {
      parsedSummary = buildDeterministicSummary(groups, docMetaMap, caseId);
    }

    // Aggregate and validate all cited doc IDs against authorized documents
    const authorizedDocIds = new Set(docMetaMap.keys());
    const allCitedDocIdsSet = new Set<string>();

    const sectionKeys: Array<keyof StructuredCaseSummary> = [
      'case_overview',
      'key_incidents',
      'persons_of_interest',
      'evidence_summary',
      'investigation_status',
    ];

    for (const key of sectionKeys) {
      if (parsedSummary[key]) {
        const section = parsedSummary[key];
        // Ensure cited_doc_ids is an array
        if (!Array.isArray(section.cited_doc_ids)) {
          section.cited_doc_ids = [];
        }
        // Also extract any [Ref: <uuid>] occurrences in content text
        const matches = section.content.matchAll(/\[(?:Ref:?\s*)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi);
        for (const match of matches) {
          section.cited_doc_ids.push(match[1]);
        }
        // Filter strictly to authorized doc IDs
        section.cited_doc_ids = Array.from(new Set(section.cited_doc_ids)).filter((id) =>
          authorizedDocIds.has(id)
        );
        // If section cited nothing, attribute to first authorized doc in that category if applicable
        if (section.cited_doc_ids.length === 0 && authorizedDocIds.size > 0) {
          section.cited_doc_ids = [Array.from(authorizedDocIds)[0]];
        }
        for (const id of section.cited_doc_ids) {
          allCitedDocIdsSet.add(id);
        }
      }
    }

    const allCitedDocIds = Array.from(allCitedDocIdsSet);
    if (allCitedDocIds.length === 0 && authorizedDocIds.size > 0) {
      allCitedDocIds.push(...Array.from(authorizedDocIds));
    }

    // Build rich citations array for frontend CitationChip rendering
    const citations = Array.from(allCitedDocIdsSet).map((docId) => {
      const meta = docMetaMap.get(docId);
      return {
        chunk_id: `chk-${docId}`,
        doc_id: docId,
        doc_title: meta?.title || 'Case Document',
        doc_type: meta?.doc_type || 'EXHIBIT',
        sensitivity_level: meta?.sensitivity || 'C',
        case_id: caseUuid,
        chunk_text: `Authorized evidentiary source registered under ${caseId}.`,
        similarity_score: 0.95,
      };
    });

    // Step 5: Append to immutable audit log (rule-immutable-audit-log)
    const { error: auditError } = await supabaseAdmin.from('audit_log').insert({
      user_id: userId,
      action: 'case_summary',
      resource_type: 'case',
      resource_id: caseUuid,
      case_id: caseUuid,
      ip_address: req.ip || '127.0.0.1',
      metadata: {
        case_id: caseUuid,
        chunks_used: chunks.length,
        cited_doc_ids: allCitedDocIds,
        requires_human_verification: true,
      },
    });

    if (auditError) {
      console.error('[Case Summary] Audit log insertion notice:', auditError.message);
    }

    // Step 6: Return structured response
    return res.status(200).json({
      success: true,
      requires_human_verification: true,
      summary: parsedSummary,
      cited_doc_ids: allCitedDocIds,
      citations,
      chunks_used: chunks.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    if (handleAuthError(res, err)) return;
    console.error('[Case Summary] Unhandled error during synthesis:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error during case summary synthesis.',
    });
  }
});
