import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { resolveUser, handleAuthError } from '../middleware/resolveUser.js';

export const auditRouter = Router();

/**
 * Helper to resolve case_number or case UUID to UUID
 */
async function resolveCaseId(caseIdentifier: string): Promise<string | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseIdentifier);
  if (isUuid) return caseIdentifier;

  const { data } = await supabaseAdmin
    .from('cases')
    .select('id')
    .eq('case_number', caseIdentifier)
    .maybeSingle();

  return data ? data.id : null;
}

/**
 * Helper to construct a human-readable description for an audit log event
 */
function buildHumanReadableDescription(row: any): string {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const actorName = profile?.name || 'Authorized Officer';
  const actorRole = profile?.role ? `(${profile.role})` : '';
  const meta = row.metadata || {};

  switch (row.action) {
    case 'upload':
    case 'DOCUMENT_UPLOADED': {
      const filename = meta.filename || meta.title || 'evidence document';
      return `${actorName} ${actorRole} uploaded ${filename}`;
    }
    case 'download':
    case 'DOCUMENT_DOWNLOADED': {
      const filename = meta.filename || (row.resource_id ? `document ${row.resource_id}` : 'evidence file');
      const ver = meta.version_number ? ` (v${meta.version_number})` : '';
      return `${actorName} ${actorRole} downloaded ${filename}${ver}`;
    }
    case 'new_version': {
      const ver = meta.version_number ? `v${meta.version_number}` : 'new version';
      const filename = meta.filename || meta.title || 'evidence document';
      return `${actorName} ${actorRole} uploaded revision ${ver} for ${filename}`;
    }
    case 'share_requested':
    case 'SHARE_INITIATED': {
      const recipient = meta.recipient || meta.shared_with || 'recipient agency';
      const dual = meta.requires_dual_auth ? ' (requires supervisor dual-authorization)' : '';
      return `${actorName} ${actorRole} initiated controlled document share to ${recipient}${dual}`;
    }
    case 'share_approved':
    case 'SHARE_APPROVED': {
      return `${actorName} ${actorRole} confirmed dual-authorization approval for share ${row.resource_id || ''}`.trim();
    }
    case 'share_rejected':
    case 'SHARE_REJECTED': {
      const reason = meta.reason ? `: "${meta.reason}"` : '';
      return `${actorName} ${actorRole} rejected share request${reason}`;
    }
    case 'verification_requested':
    case 'VERIFICATION_REQUESTED': {
      return `${actorName} ${actorRole} initiated cryptographic tamper verification on document ${row.resource_id || ''}`.trim();
    }
    case 'verification_report_generated':
    case 'VERIFICATION_REPORT_GENERATED': {
      return `${actorName} ${actorRole} generated formal court verification report`;
    }
    case 'search_query':
    case 'SEARCH_QUERY': {
      const q = meta.query ? ` "${meta.query}"` : '';
      return `${actorName} ${actorRole} executed ABAC semantic intelligence search${q}`;
    }
    case 'login_success':
    case 'LOGIN_SUCCESS': {
      return `${actorName} authenticated successfully via MFA`;
    }
    case 'login_failed':
    case 'LOGIN_FAILED': {
      return `Failed authentication attempt from IP ${row.ip_address || 'unknown'}`;
    }
    case 'MFA_FAILED': {
      return `MFA verification challenge failed from IP ${row.ip_address || 'unknown'}`;
    }
    default:
      return `${actorName} ${actorRole} performed ${row.action} on ${row.resource_type || 'resource'}`;
  }
}

/**
 * GET /api/v1/audit
 * Returns immutable audit log rows.
 * Filterable by case_id, user_id, action, start_date, end_date.
 * Enforces role-based case scoping:
 * - Admin and Supervisor: cross-case visibility.
 * - Officers / other roles: strictly scoped to assigned cases and own actions.
 */
auditRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { userId, userRole, userCaseIds } = await resolveUser(req.headers.authorization);

    const isPrivileged = userRole === 'ADMIN' || userRole === 'SUPERVISOR';
    const assignedCaseIds = userCaseIds;

    // Parse filters
    const {
      case_id: caseParam,
      user_id: userParam,
      action: actionParam,
      start_date: startDateParam,
      end_date: endDateParam,
      limit: limitParam,
      offset: offsetParam,
    } = req.query;

    let targetCaseUuid: string | null = null;
    if (caseParam && typeof caseParam === 'string') {
      targetCaseUuid = await resolveCaseId(caseParam);
      if (!targetCaseUuid) {
        return res.status(404).json({ success: false, error: `Case '${caseParam}' not found.` });
      }

      // If officer/non-privileged requests a case they are NOT assigned to, return 403 Forbidden
      if (!isPrivileged && !assignedCaseIds.includes(targetCaseUuid)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Access denied to audit records for unassigned case.',
        });
      }
    }

    // Build base query
    let query = supabaseAdmin
      .from('audit_log')
      .select(
        `
        id,
        user_id,
        action,
        resource_type,
        resource_id,
        case_id,
        ip_address,
        metadata,
        created_at,
        profiles:user_id (
          id,
          name,
          role
        ),
        cases:case_id (
          id,
          case_number,
          title
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply specific case filter if provided
    if (targetCaseUuid) {
      query = query.eq('case_id', targetCaseUuid);
    } else if (!isPrivileged) {
      if (assignedCaseIds.length > 0) {
        query = query.or(`case_id.in.(${assignedCaseIds.join(',')}),and(case_id.is.null,user_id.eq.${userId})`);
      } else {
        query = query.eq('user_id', userId);
      }
    }

    // Filter by action if provided
    if (actionParam && typeof actionParam === 'string' && actionParam !== 'ALL') {
      // Handle both lowercase and uppercase variants
      query = query.or(`action.eq.${actionParam.toLowerCase()},action.eq.${actionParam.toUpperCase()}`);
    }

    // Filter by actor user_id if provided
    if (userParam && typeof userParam === 'string') {
      query = query.eq('user_id', userParam);
    }

    // Filter by date range
    if (startDateParam && typeof startDateParam === 'string') {
      query = query.gte('created_at', startDateParam);
    }
    if (endDateParam && typeof endDateParam === 'string') {
      query = query.lte('created_at', endDateParam);
    }

    // Pagination
    const limit = Math.min(parseInt(limitParam as string, 10) || 50, 200);
    const offset = Math.max(parseInt(offsetParam as string, 10) || 0, 0);
    query = query.range(offset, offset + limit - 1);

    const { data: rows, count, error: queryError } = await query;

    if (queryError) {
      return res.status(500).json({ success: false, error: queryError.message });
    }

    // Format rows with human-readable description and normalized fields
    const formatted = (rows || []).map((row: any) => {
      const userProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const caseData = Array.isArray(row.cases) ? row.cases[0] : row.cases;

      return {
        id: row.id,
        log_id: row.id,
        user_id: row.user_id,
        username: userProfile?.name || 'Officer',
        user_name: userProfile?.name || 'Officer',
        user_role: (userProfile?.role || 'officer').toUpperCase(),
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        doc_id: row.resource_type === 'document' ? row.resource_id : row.metadata?.document_id || row.metadata?.doc_id,
        case_id: row.case_id,
        case_number: caseData?.case_number || null,
        case_title: caseData?.title || null,
        ip_address: row.ip_address || '127.0.0.1',
        description: buildHumanReadableDescription(row),
        metadata: row.metadata || {},
        created_at: row.created_at,
        timestamp: row.created_at,
      };
    });

    return res.json({
      success: true,
      requires_human_verification: true,
      audit_logs: formatted,
      count: count || formatted.length,
      limit,
      offset,
    });
  } catch (err: any) {
    if (handleAuthError(res, err)) return;
    console.error('[Audit API] Error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to retrieve audit trail.' });
  }
});
