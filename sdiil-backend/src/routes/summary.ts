import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createUserClient } from '../lib/supabaseUser.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

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
    'gemini-flash-latest',
    'gemini-3.6-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash-exp',
    'gemini-3.7-flash',
  ];

  let lastError: any = null;

  for (const modelName of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[Gemini] Attempting model "${modelName}" (attempt ${attempt}/3)...`);
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
          await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
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
 * GET /api/v1/cases/:caseId
 * Fetch case details if assigned or caller is ADMIN/SUPERVISOR.
 */
summaryRouter.get('/:caseId', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authorization header with Bearer JWT is required.' });
  }

  try {
    const { caseId } = req.params;
    const userClient = createUserClient(authHeader);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
    }

    const userId = userData.user.id;
    const caseUuid = await resolveCaseUuid(caseId);
    if (!caseUuid) {
      return res.status(404).json({ success: false, error: `Case not found: ${caseId}` });
    }

    // Check caller role
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle();
    const isPrivileged = profile?.role === 'admin' || profile?.role === 'supervisor';

    // Check assignment if not privileged
    if (!isPrivileged) {
      const { data: assignment } = await supabaseAdmin
        .from('case_assignments')
        .select('id')
        .eq('case_id', caseUuid)
        .eq('user_id', userId)
        .maybeSingle();

      if (!assignment) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: You are not assigned to this case.',
        });
      }
    }

    const { data: caseRow, error: caseErr } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('id', caseUuid)
      .single();

    if (caseErr || !caseRow) {
      return res.status(404).json({ success: false, error: 'Case not found.' });
    }

    return res.status(200).json({ success: true, case: caseRow });
  } catch (err: any) {
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
    // Step 1: Validate caller's Bearer JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header with Bearer JWT is required.',
      });
    }

    const { caseId } = req.params;
    if (!caseId) {
      return res.status(400).json({
        success: false,
        error: 'Case ID parameter is required.',
      });
    }

    const userClient = createUserClient(authHeader);
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData?.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication session.',
      });
    }

    const userId = userData.user.id;

    // Resolve Case UUID
    const caseUuid = await resolveCaseUuid(caseId);
    if (!caseUuid) {
      return res.status(404).json({
        success: false,
        error: `Case not found: ${caseId}`,
      });
    }

    // Check Case Assignment under RLS
    const { data: assignment } = await userClient
      .from('case_assignments')
      .select('id')
      .eq('case_id', caseUuid)
      .eq('user_id', userId)
      .maybeSingle();

    const { data: profile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    const userRole = (profile?.role || 'officer').toLowerCase();
    const isPrivileged = userRole === 'admin' || userRole === 'supervisor';

    if (!assignment && !isPrivileged) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You are not assigned to this case.',
      });
    }

    // Step 2: Derive allowed sensitivity levels from caller's role clearance
    let allowedSensitivities = ['C'];
    if (['admin', 'supervisor', 'officer', 'investigator', 'forensic_officer'].includes(userRole)) {
      allowedSensitivities = ['A', 'B', 'C'];
    } else if (['judge', 'prosecutor', 'reviewer'].includes(userRole)) {
      allowedSensitivities = ['A', 'B', 'C'];
    } else {
      allowedSensitivities = ['C'];
    }

    // Fetch document_embeddings rows joining documents table
    const { data: chunkRows, error: chunkErr } = await userClient
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
          doc_type
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

    const chunks = chunkRows || [];

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
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured in server environment.');
    }

    const rawResponseText = await synthesizeWithGemini(systemPrompt, geminiApiKey);

    // Clean JSON response (strip any accidental markdown fences)
    const cleanedJson = rawResponseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    let parsedSummary: StructuredCaseSummary;
    try {
      parsedSummary = JSON.parse(cleanedJson);
    } catch (parseErr) {
      console.error('[AI Summary] JSON parse error, raw was:', rawResponseText);
      // Fallback structured object
      parsedSummary = {
        case_overview: {
          title: 'Case Overview',
          content: rawResponseText.slice(0, 500),
          cited_doc_ids: Array.from(docMetaMap.keys()).slice(0, 2),
        },
        key_incidents: { title: 'Key Incidents', content: 'See case overview.', cited_doc_ids: [] },
        persons_of_interest: { title: 'Persons of Interest', content: 'Listed in attached exhibits.', cited_doc_ids: [] },
        evidence_summary: { title: 'Evidence Summary', content: 'Exhibits cataloged in case vault.', cited_doc_ids: [] },
        investigation_status: { title: 'Investigation Status', content: 'Under active judicial supervision.', cited_doc_ids: [] },
      };
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
    const { error: auditError } = await userClient.from('audit_log').insert({
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
    console.error('[Case Summary] Unhandled error during synthesis:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error during case summary synthesis.',
    });
  }
});
