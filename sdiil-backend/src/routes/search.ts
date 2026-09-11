import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { createUserClient } from '../lib/supabaseUser.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { generateEmbedding, generateRAGAnswer, RetrievedChunk } from '../lib/aiService.js';
import { anomalyService } from '../services/anomalyService.js';

import { resolveUser, handleAuthError } from '../middleware/resolveUser.js';

export const searchRouter = Router();

/**
 * Helper to resolve case ID.
 * Accepts either UUID or case_number (e.g. MH-PN-2026-0142).
 */
async function resolveCaseId(caseIdentifier: string): Promise<string> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseIdentifier);
  if (isUuid) {
    return caseIdentifier;
  }

  const { data: caseRow } = await supabaseAdmin
    .from('cases')
    .select('id')
    .eq('case_number', caseIdentifier)
    .maybeSingle();

  return caseRow?.id || '00000000-0000-0000-0000-000000000000';
}

/**
 * POST /api/v1/search
 * ABAC-gated semantic intelligence search over authorized evidentiary chunks.
 *
 * Enforces:
 * - rule-abac-filter-at-retrieval-layer: pgvector similarity query strictly filtered
 *   in SQL via match_document_chunks RPC before chunks reach application memory.
 * - rule-ai-output-requires-human-verification-flag: top-level requires_human_verification: true.
 * - rule-immutable-audit-log: search query and cited doc IDs logged to audit_log.
 */
searchRouter.post('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const { userId, userRole, userCaseIds } = await resolveUser(authHeader);

    const { query, case_id, match_count } = req.body;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required and cannot be empty.',
      });
    }

    // Resolve filter_case_id if provided
    let filterCaseUuid: string | null = null;
    if (case_id && typeof case_id === 'string' && case_id.trim() !== '') {
      filterCaseUuid = await resolveCaseId(case_id.trim());
    }

    // Step 1: Generate 1536-dimensional query embedding vector
    const queryEmbedding = await generateEmbedding(query.trim());

    // Step 2: ABAC-gated retrieval via pgvector stored procedure
    // Note: The RPC runs with security invoker under user's JWT and filters:
    // WHERE case_id in (user's assigned cases OR shared docs) AND clearance allows sensitivity
    const limitCount = typeof match_count === 'number' && match_count > 0 ? Math.min(match_count, 20) : 8;

    const userClient = createUserClient(authHeader!);
    const { data: chunks, error: rpcError } = await userClient.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_count: limitCount,
      filter_case_id: filterCaseUuid,
    });

    if (rpcError) {
      console.error('[Search RPC Error]:', rpcError);
      return res.status(500).json({
        success: false,
        error: `Retrieval layer error: ${rpcError.message}`,
      });
    }

    let retrievedChunks: RetrievedChunk[] = chunks || [];

    // Application-level attenuation filter (defense-in-depth)
    // The RPC (match_document_chunks) already enforces document status visibility at the SQL layer,
    // but we add an application-level check to ensure REJECTED documents never enter RAG context.
    // PENDING_REVIEW documents of other officers are also filtered out here.
    if (retrievedChunks.length > 0) {
      const docIds = [...new Set(retrievedChunks.map((c: any) => c.document_id))];
      const { data: docStatuses } = await supabaseAdmin
        .from('documents')
        .select('id, status, uploaded_by')
        .in('id', docIds);

      const blockedDocIds = new Set<string>();
      for (const ds of docStatuses || []) {
        if (ds.status === 'REJECTED') {
          blockedDocIds.add(ds.id);
        } else if (ds.status === 'PENDING_REVIEW' && ds.uploaded_by !== userId) {
          if (userRole !== 'SUPERVISOR' && userRole !== 'ADMIN') {
            blockedDocIds.add(ds.id);
          }
        }
      }

      if (blockedDocIds.size > 0) {
        retrievedChunks = retrievedChunks.filter((c: any) => !blockedDocIds.has(c.document_id));
      }
    }

    // Step 3: Synthesize intelligence response strictly from retrieved chunks
    let ragResult: {
      answer: string;
      citations: any[];
      cited_doc_ids: string[];
      chunks_used_count: number;
      citation_hallucinated: boolean;
    };

    if (retrievedChunks.length === 0) {
      ragResult = {
        answer: 'No authorized document chunks found matching your query.',
        citations: [],
        cited_doc_ids: [],
        chunks_used_count: 0,
        citation_hallucinated: false,
      };
    } else {
      ragResult = await generateRAGAnswer(query, retrievedChunks);
    }

    // Step 4: Record search event in audit log (rule-immutable-audit-log)
    const { error: auditError } = await supabaseAdmin.from('audit_log').insert({
      user_id: userId,
      action: 'search',
      resource_type: 'document',
      resource_id: ragResult.cited_doc_ids[0] || null,
      case_id: filterCaseUuid || null,
      ip_address: req.ip || '127.0.0.1',
      metadata: {
        query: query.trim(),
        filter_case_id: filterCaseUuid,
        chunks_retrieved: retrievedChunks.length,
        chunks_returned: String(retrievedChunks.length),
        cited_doc_ids: ragResult.cited_doc_ids,
        requires_human_verification: true,
      },
    });

    if (auditError) {
      console.error('[Search] Audit log notice:', auditError.message);
    }

    // Step 4b: Non-blocking anomaly evaluation (Rule 3)
    anomalyService.evaluateAnomalies(userId, 'search', filterCaseUuid, {
      chunks_returned: String(retrievedChunks.length),
      query: query.trim(),
    }).catch((err) => console.error('[AnomalyService] Evaluation notice:', err));

    // Step 5: Return synthesized answer and citations with mandatory human verification flag
    return res.status(200).json({
      success: true,
      requires_human_verification: true,
      answer: ragResult.answer,
      citations: ragResult.citations,
      cited_doc_ids: ragResult.cited_doc_ids,
      chunks_used_count: ragResult.chunks_used_count,
      citation_hallucinated: ragResult.citation_hallucinated,
      query_id: crypto.randomUUID(),
      query_timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    if (handleAuthError(res, err)) return;
    console.error('[Search] Unhandled search error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error during semantic search.',
    });
  }
});
