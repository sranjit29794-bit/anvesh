import { Router, Request, Response } from 'express';
import { createUserClient } from '../lib/supabaseUser.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { anomalyService } from '../services/anomalyService.js';

export const anomaliesRouter = Router();

/**
 * GET /api/v1/anomalies
 * Returns all unacknowledged anomaly_flags rows ordered by triggered_at descending.
 * Enforces RLS via createUserClient:
 * - ADMIN & SUPERVISOR get all rows across all cases.
 * - Officers and Judges get only rows for their assigned cases.
 */
anomaliesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header with Bearer JWT is required.',
      });
    }

    const userClient = createUserClient(authHeader);
    const { data: userData, error: userErr } = await userClient.auth.getUser();

    if (userErr || !userData?.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication session.',
      });
    }

    // Query anomaly_flags under RLS
    const { data: anomalies, error: anomaliesErr } = await userClient
      .from('anomaly_flags')
      .select(`
        id,
        case_id,
        user_id,
        rule_triggered,
        severity,
        description,
        metadata,
        triggered_at,
        acknowledged,
        acknowledged_by,
        acknowledged_at
      `)
      .eq('acknowledged', false)
      .order('triggered_at', { ascending: false });

    if (anomaliesErr) {
      console.error('[Anomalies API] Query error:', anomaliesErr);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch anomaly records: ${anomaliesErr.message}`,
      });
    }

    // Enrich with user profile info and case details if available
    const userIds = Array.from(new Set((anomalies || []).map((a) => a.user_id).filter(Boolean)));
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, role')
      .in('id', userIds);

    const profileMap = new Map<string, any>();
    if (profiles) {
      for (const p of profiles) {
        profileMap.set(p.id, p);
      }
    }

    const enriched = (anomalies || []).map((a) => {
      const p = profileMap.get(a.user_id);
      return {
        ...a,
        user: p
          ? { id: p.id, username: p.username, full_name: p.full_name, role: p.role }
          : { id: a.user_id, username: 'Unknown', full_name: 'Unknown User', role: 'officer' },
      };
    });

    return res.status(200).json({
      success: true,
      anomalies: enriched,
      count: enriched.length,
    });
  } catch (err: any) {
    console.error('[Anomalies API] Unhandled error in GET /:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error fetching anomaly flags.',
    });
  }
});

/**
 * GET /api/v1/anomalies/stats
 * Returns counts grouped by severity and rule_triggered for dashboard stat cards.
 * Enforces the same RLS scoping.
 */
anomaliesRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header with Bearer JWT is required.',
      });
    }

    const userClient = createUserClient(authHeader);
    const { data: userData, error: userErr } = await userClient.auth.getUser();

    if (userErr || !userData?.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication session.',
      });
    }

    // Query unacknowledged anomaly flags under RLS
    const { data: rows, error } = await userClient
      .from('anomaly_flags')
      .select('severity, rule_triggered')
      .eq('acknowledged', false);

    if (error) {
      return res.status(500).json({
        success: false,
        error: `Failed to fetch anomaly statistics: ${error.message}`,
      });
    }

    const bySeverity: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    const byRule: Record<string, number> = {};

    for (const r of rows || []) {
      const sev = r.severity ? r.severity.toUpperCase() : 'LOW';
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;

      const rule = r.rule_triggered || 'UNKNOWN';
      byRule[rule] = (byRule[rule] || 0) + 1;
    }

    return res.status(200).json({
      success: true,
      total_unacknowledged: (rows || []).length,
      by_severity: bySeverity,
      by_rule: byRule,
    });
  } catch (err: any) {
    console.error('[Anomalies API] Stats error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error computing anomaly stats.',
    });
  }
});

/**
 * PATCH /api/v1/anomalies/:id/acknowledge
 * Acknowledges an anomaly flag.
 * Restricted strictly to ADMIN and SUPERVISOR roles.
 */
anomaliesRouter.patch('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header with Bearer JWT is required.',
      });
    }

    const userClient = createUserClient(authHeader);
    const { data: userData, error: userErr } = await userClient.auth.getUser();

    if (userErr || !userData?.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication session.',
      });
    }

    const userId = userData.user.id;

    // Check caller role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    const role = (profile?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'supervisor') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Only ADMIN and SUPERVISOR roles may acknowledge security anomalies.',
      });
    }

    const { id } = req.params;
    const now = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('anomaly_flags')
      .update({
        acknowledged: true,
        acknowledged_by: userId,
        acknowledged_at: now,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      return res.status(500).json({
        success: false,
        error: `Failed to acknowledge anomaly: ${updateErr.message}`,
      });
    }

    // Log acknowledgment to audit trail
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId,
      action: 'anomaly_acknowledged',
      resource_type: 'anomaly_flag',
      resource_id: id,
      case_id: updated?.case_id || null,
      ip_address: req.ip || '127.0.0.1',
      metadata: {
        anomaly_id: id,
        rule_triggered: updated?.rule_triggered,
        severity: updated?.severity,
      },
    });

    return res.status(200).json({
      success: true,
      anomaly: updated,
      message: 'Anomaly successfully acknowledged.',
    });
  } catch (err: any) {
    console.error('[Anomalies API] Acknowledge error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error acknowledging anomaly.',
    });
  }
});

/**
 * POST /api/v1/anomalies/demo-trigger
 * Live demonstration endpoint (ADMIN & SUPERVISOR only).
 * Triggers BULK_DOWNLOAD (> 5 rapid downloads) and REPEATED_SEARCH_NO_RESULT (3 zero-chunk searches).
 * Surfaced live within 2 seconds via Supabase Realtime.
 */
anomaliesRouter.post('/demo-trigger', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header with Bearer JWT is required.',
      });
    }

    const userClient = createUserClient(authHeader);
    const { data: userData, error: userErr } = await userClient.auth.getUser();

    if (userErr || !userData?.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication session.',
      });
    }

    const userId = userData.user.id;

    // Check caller role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    const role = (profile?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'supervisor') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Only ADMIN and SUPERVISOR roles may trigger demo anomalies.',
      });
    }

    // Resolve an assigned case for this user
    let targetCaseId: string | null = null;
    const { data: assignment } = await supabaseAdmin
      .from('case_assignments')
      .select('case_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (assignment?.case_id) {
      targetCaseId = assignment.case_id;
    } else {
      // Default to first case if admin has no explicit direct assignment row
      const { data: anyCase } = await supabaseAdmin.from('cases').select('id').limit(1).single();
      targetCaseId = anyCase?.id || '8909e909-0869-4e0b-9b38-67c64c80891b';
    }

    // 1. Rapidly simulate 6 document downloads (triggers BULK_DOWNLOAD)
    for (let i = 1; i <= 6; i++) {
      await supabaseAdmin.from('audit_log').insert({
        user_id: userId,
        action: 'download',
        resource_type: 'document',
        resource_id: `demo-doc-download-${i}`,
        case_id: targetCaseId,
        ip_address: req.ip || '127.0.0.1',
        metadata: {
          demo_trigger: true,
          download_number: i,
          case_id: targetCaseId,
          sensitivity_level: 'B',
        },
      });
    }

    // Evaluate BULK_DOWNLOAD
    await anomalyService.evaluateAnomalies(userId, 'download', targetCaseId, {
      demo_trigger: true,
    });

    // 2. Wait 500ms
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 3. Rapidly simulate 3 search queries with zero returned chunks (triggers REPEATED_SEARCH_NO_RESULT)
    for (let i = 1; i <= 3; i++) {
      await supabaseAdmin.from('audit_log').insert({
        user_id: userId,
        action: 'search',
        resource_type: 'document',
        case_id: targetCaseId,
        ip_address: req.ip || '127.0.0.1',
        metadata: {
          demo_trigger: true,
          chunks_returned: '0',
          chunks_retrieved: 0,
          query: `demo suspicious probe ${i}`,
          case_id: targetCaseId,
        },
      });
    }

    // Evaluate REPEATED_SEARCH_NO_RESULT
    await anomalyService.evaluateAnomalies(userId, 'search', targetCaseId, {
      demo_trigger: true,
      chunks_returned: '0',
    });

    return res.status(200).json({
      success: true,
      message: 'Demo anomalies triggered successfully (BULK_DOWNLOAD and REPEATED_SEARCH_NO_RESULT).',
      case_id: targetCaseId,
    });
  } catch (err: any) {
    console.error('[Anomalies API] Demo trigger error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error triggering demo anomalies.',
    });
  }
});
