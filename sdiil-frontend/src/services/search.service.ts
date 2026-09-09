import { db, delay } from './api';
import { UserRole } from '@/types/auth.types';
import { RAGSearchResponse, RAGSearchCitation } from '@/types/document.types';
import { CaseSummaryResponse } from '@/types/case.types';
import { ROLE_SENSITIVITY_CLEARANCE } from '@/utils/roleGuard';

export const searchService = {
  /**
   * ABAC-gated semantic RAG search across case documents
   * (workflow-auth-rag-search & rule-abac-filter-at-retrieval-layer)
   */
  async search(
    caseId: string,
    query: string,
    userRole: UserRole,
    userId: string,
    username: string
  ): Promise<RAGSearchResponse> {
    await delay(450);

    if (!query || !query.trim()) {
      throw new Error('Query string is required');
    }

    // Derive allowed sensitivity levels strictly from user role clearance
    const allowedSensitivities = ROLE_SENSITIVITY_CLEARANCE[userRole] || ['C'];

    // Retrieval layer ABAC filter (rule-abac-filter-at-retrieval-layer)
    const candidateDocs = db.documents.filter(
      (doc) => doc.case_id === caseId && allowedSensitivities.includes(doc.sensitivity_level)
    );

    const queryLower = query.toLowerCase();
    const citations: RAGSearchCitation[] = [];

    // Match query against authorized doc chunks
    for (const doc of candidateDocs) {
      const text = (doc.ocr_text || '').toLowerCase();
      const title = doc.title.toLowerCase();

      // Check simple relevance
      let matchScore = 0.65;
      const terms = queryLower.split(/\s+/).filter((t) => t.length > 2);
      for (const term of terms) {
        if (title.includes(term)) matchScore += 0.15;
        if (text.includes(term)) matchScore += 0.1;
      }

      if (matchScore > 0.7 || terms.length === 0) {
        citations.push({
          chunk_id: `chk-${doc.file_id}-01`,
          doc_id: doc.file_id,
          doc_title: doc.title,
          doc_type: doc.doc_type,
          sensitivity_level: doc.sensitivity_level,
          chunk_text: doc.ocr_text
            ? doc.ocr_text.split('\n').slice(0, 4).join(' ')
            : 'Evidence record registered in secure vault.',
          similarity_score: Math.min(0.98, matchScore),
        });
      }
    }

    const citedDocIds = Array.from(new Set(citations.map((c) => c.doc_id)));

    // Synthesize structured answer strictly from authorized chunks
    let answerText = '';
    if (citations.length === 0) {
      answerText = `No authorized documents found matching query "${query}" for case ${caseId} under your current clearance (${allowedSensitivities.join(
        ', '
      )}). Documents with higher sensitivity or unassigned access are filtered out at the retrieval layer.`;
    } else {
      answerText = `Based on an authorized semantic analysis of ${citations.length} document chunk(s) across case ${caseId}:
      
1. The evidentiary records establish active transactions matching the queried parameters (${citedDocIds.join(
        ', '
      )}).
2. Key witness statements and forensic artifacts indicate cross-entity routing with verified SHA-256 integrity anchors.
3. Relevant timeline dates and operational nodes have been correlated strictly from authorized chunks.`;
    }

    // Log query in immutable audit trail
    db.logAudit({
      user_id: userId,
      username,
      action: 'SEARCH_QUERY',
      case_id: caseId,
      ip_address: '10.14.22.8',
      metadata: {
        query_text: query,
        retrieved_chunk_count: citations.length,
        cited_doc_ids: citedDocIds,
        allowed_sensitivities: allowedSensitivities,
      },
    });

    return {
      answer: answerText,
      cited_doc_ids: citedDocIds,
      citations,
      chunks_used_count: citations.length,
      requires_human_verification: true,
      query_id: `qry-${Date.now()}`,
      flags: {
        citation_hallucinated: false,
      },
      query_timestamp: new Date().toISOString(),
    };
  },

  /**
   * AI-generated Case Summary over authorized documents (workflow-case-summary)
   */
  async getCaseSummary(
    caseId: string,
    userRole: UserRole,
    userId: string,
    username: string
  ): Promise<CaseSummaryResponse> {
    await delay(500);

    const c = db.cases.find((item) => item.case_id === caseId);
    if (!c) throw new Error('Case not found');

    const allowedSensitivities = ROLE_SENSITIVITY_CLEARANCE[userRole] || ['C'];
    const authorizedDocs = db.documents.filter(
      (doc) => doc.case_id === caseId && allowedSensitivities.includes(doc.sensitivity_level)
    );

    const citedDocIds = authorizedDocs.map((d) => d.file_id);

    db.logAudit({
      user_id: userId,
      username,
      action: 'SEARCH_QUERY',
      case_id: caseId,
      ip_address: '10.14.22.8',
      metadata: { action: 'GENERATE_CASE_SUMMARY', authorized_docs_count: authorizedDocs.length },
    });

    return {
      case_id: caseId,
      case_number: c.case_number,
      executive_summary: `[SYNTHETIC AI CASE SUMMARY]\nInvestigation regarding ${c.title} under ${c.department}. Aggregated from ${authorizedDocs.length} authorized evidentiary records within your clearance profile. Primary findings point to coordinated off-ledger banking transactions corroborated by forensic bitstream extractions.`,
      key_findings: [
        'Initial FIR lodged under Sections 420 & 120B IPC r/w Sec 66C/D IT Act.',
        'Digital evidence recovered from 2TB hard drive indicates 42 deleted ledger files modified during March 2024.',
        'Statutory Section 91 CrPC notices served to telecom and banking intermediaries.',
        ...(allowedSensitivities.includes('A')
          ? ['Protected Section 164 CrPC statement corroborates INR 4.2 Cr money trail (Sensitivity A).']
          : ['[Higher Sensitivity A materials omitted per your clearance profile].']),
      ],
      timeline_highlights: ([
        {
          date: '15/03/2024',
          event: 'FIR registered at Special Cell',
          doc_id: 'doc-del-003',
          sensitivity_level: 'B' as const,
        },
        {
          date: '16/03/2024',
          event: 'Sec 91 CrPC Notice dispatched to Telecom Intermediary',
          doc_id: 'doc-del-004',
          sensitivity_level: 'C' as const,
        },
        {
          date: '18/03/2024',
          event: 'Protected Witness Deposition recorded under Sec 164 CrPC',
          doc_id: 'doc-del-001',
          sensitivity_level: 'A' as const,
        },
        {
          date: '22/03/2024',
          event: 'Forensic Science Laboratory issues digital bitstream report',
          doc_id: 'doc-del-002',
          sensitivity_level: 'B' as const,
        },
      ] as Array<{ date: string; event: string; doc_id: string; sensitivity_level: import('@/types/document.types').SensitivityLevel }>).filter((t) =>
        allowedSensitivities.includes(t.sensitivity_level)
      ),
      cited_doc_ids: citedDocIds,
      requires_human_verification: true,
      generated_at: new Date().toISOString(),
    };
  },
};
