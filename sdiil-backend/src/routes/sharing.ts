import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { resolveUser, handleAuthError } from '../middleware/resolveUser.js';

export const sharingRouter = Router();

/**
 * GET /api/v1/sharing/pending-approvals
 * Lists pending dual-auth sharing requests (restricted to supervisor and admin roles).
 */
sharingRouter.get('/pending-approvals', async (req: Request, res: Response) => {
  try {
    const { userId, userRole } = await resolveUser(req.headers.authorization);

    if (userRole !== 'SUPERVISOR' && userRole !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Dual-authorization queue access restricted to Supervisor and Admin roles.',
      });
    }

    // Query pending sharing events
    const { data: pendingEvents, error: queryError } = await supabaseAdmin
      .from('sharing_events')
      .select(`
        id,
        document_id,
        shared_by,
        shared_with,
        requires_dual_auth,
        approval_status,
        access_expires_at,
        share_reason,
        created_at,
        documents (
          id,
          title,
          doc_type,
          sensitivity_level,
          case_id
        ),
        initiator:profiles!shared_by (
          id,
          name,
          role
        ),
        recipient:profiles!shared_with (
          id,
          name,
          role
        )
      `)
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });

    if (queryError) {
      return res.status(500).json({ success: false, error: queryError.message });
    }

    const formatted = (pendingEvents || []).map((e: any) => {
      const doc = Array.isArray(e.documents) ? e.documents[0] : e.documents;
      const initiator = Array.isArray(e.initiator) ? e.initiator[0] : e.initiator;
      const recipient = Array.isArray(e.recipient) ? e.recipient[0] : e.recipient;

      return {
        approval_id: e.id,
        sharing_event_id: e.id,
        doc_id: e.document_id,
        doc_title: doc?.title || 'Classified Evidence Document',
        doc_type: doc?.doc_type || 'Evidence',
        case_id: doc?.case_id || '',
        sensitivity_level: doc?.sensitivity_level || 'A',
        initiator_id: e.shared_by,
        initiator_name: initiator?.name || 'Authorized Officer',
        initiator_role: initiator?.role || 'officer',
        recipient_user_id: e.shared_with,
        recipient_name: recipient?.name || 'Recipient Agency',
        recipient_role: recipient?.role || 'judge',
        share_reason: e.share_reason || 'Inter-agency evidentiary review',
        status: 'PENDING',
        created_at: e.created_at,
        access_expires_at: e.access_expires_at,
      };
    });

    return res.json({
      success: true,
      requires_human_verification: true,
      approvals: formatted,
      count: formatted.length,
    });
  } catch (err: any) {
    console.error('[Pending Approvals] Error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to list pending approvals.' });
  }
});

/**
 * POST /api/v1/sharing/:sharingEventId/approve
 * Supervisor approves a pending Sensitivity-A sharing request.
 */
sharingRouter.post('/:sharingEventId/approve', async (req: Request, res: Response) => {
  try {
    const { userId, userRole } = await resolveUser(req.headers.authorization);

    if (userRole !== 'SUPERVISOR' && userRole !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Dual-authorization approvals require Supervisor or Admin clearance.',
      });
    }

    const { sharingEventId } = req.params;

    // Retrieve sharing event with document case_id
    const { data: shareEvent, error: shareErr } = await supabaseAdmin
      .from('sharing_events')
      .select('*, documents(case_id)')
      .eq('id', sharingEventId)
      .single();

    if (shareErr || !shareEvent) {
      return res.status(404).json({ success: false, error: 'Sharing request not found or access denied.' });
    }

    const docCaseId = (Array.isArray(shareEvent.documents) ? shareEvent.documents[0]?.case_id : (shareEvent.documents as any)?.case_id) || null;

    // Insert approvals row
    const { data: approvalRow, error: appErr } = await supabaseAdmin
      .from('approvals')
      .insert({
        sharing_event_id: sharingEventId,
        approver_id: userId,
        decision: 'approved',
      })
      .select('*')
      .single();

    if (appErr) {
      return res.status(500).json({ success: false, error: `Failed to record approval: ${appErr.message}` });
    }

    // Update sharing_events status to approved
    const { data: updatedEvent, error: updateErr } = await supabaseAdmin
      .from('sharing_events')
      .update({ approval_status: 'approved' })
      .eq('id', sharingEventId)
      .select('*')
      .single();

    if (updateErr) {
      return res.status(500).json({ success: false, error: `Failed to update share status: ${updateErr.message}` });
    }

    // Insert audit_log row
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId,
      action: 'share_approved',
      resource_type: 'sharing_event',
      resource_id: sharingEventId,
      case_id: docCaseId,
      ip_address: req.ip || '127.0.0.1',
      metadata: {
        sharing_event_id: sharingEventId,
        case_id: docCaseId,
        document_id: shareEvent.document_id,
        shared_with: shareEvent.shared_with,
        approver_id: userId,
        approver_name: userRole,
        approver_role: userRole,
      },
    });

    return res.json({
      success: true,
      requires_human_verification: true,
      message: 'Dual-authorization approval successfully confirmed.',
      sharing_event: updatedEvent,
      approval: approvalRow,
    });
  } catch (err: any) {
    if (handleAuthError(res, err)) return;
    console.error('[Share Approve] Error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Approval action failed.' });
  }
});

/**
 * POST /api/v1/sharing/:sharingEventId/reject
 * Supervisor rejects a pending Sensitivity-A sharing request.
 */
sharingRouter.post('/:sharingEventId/reject', async (req: Request, res: Response) => {
  try {
    const { userId, userRole } = await resolveUser(req.headers.authorization);

    if (userRole !== 'SUPERVISOR' && userRole !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Dual-authorization rejections require Supervisor or Admin clearance.',
      });
    }

    const { sharingEventId } = req.params;
    const { reason } = req.body;

    // Retrieve sharing event with document case_id
    const { data: shareEvent, error: shareErr } = await supabaseAdmin
      .from('sharing_events')
      .select('*, documents(case_id)')
      .eq('id', sharingEventId)
      .single();

    if (shareErr || !shareEvent) {
      return res.status(404).json({ success: false, error: 'Sharing request not found or access denied.' });
    }

    const docCaseId = (Array.isArray(shareEvent.documents) ? shareEvent.documents[0]?.case_id : (shareEvent.documents as any)?.case_id) || null;

    // Insert approvals row
    const { data: approvalRow, error: appErr } = await supabaseAdmin
      .from('approvals')
      .insert({
        sharing_event_id: sharingEventId,
        approver_id: userId,
        decision: 'rejected',
        reason: reason || 'Statutory review denied by supervisor',
      })
      .select('*')
      .single();

    if (appErr) {
      return res.status(500).json({ success: false, error: `Failed to record rejection: ${appErr.message}` });
    }

    // Update sharing_events status to rejected
    const { data: updatedEvent, error: updateErr } = await supabaseAdmin
      .from('sharing_events')
      .update({ approval_status: 'rejected' })
      .eq('id', sharingEventId)
      .select('*')
      .single();

    if (updateErr) {
      return res.status(500).json({ success: false, error: `Failed to update share status: ${updateErr.message}` });
    }

    // Insert audit_log row
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId,
      action: 'share_rejected',
      resource_type: 'sharing_event',
      resource_id: sharingEventId,
      case_id: docCaseId,
      ip_address: req.ip || '127.0.0.1',
      metadata: {
        sharing_event_id: sharingEventId,
        case_id: docCaseId,
        document_id: shareEvent.document_id,
        shared_with: shareEvent.shared_with,
        approver_id: userId,
        approver_name: userRole,
        reason: reason || 'Statutory review denied by supervisor',
      },
    });

    return res.json({
      success: true,
      requires_human_verification: true,
      message: 'Dual-authorization rejection confirmed.',
      sharing_event: updatedEvent,
      approval: approvalRow,
    });
  } catch (err: any) {
    if (handleAuthError(res, err)) return;
    console.error('[Share Reject] Error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Rejection action failed.' });
  }
});

/**
 * GET /api/v1/sharing/events
 * Retrieves sharing events and receipts history accessible to current user.
 */
sharingRouter.get('/events', async (req: Request, res: Response) => {
  try {
    const { userId, userRole, userCaseIds } = await resolveUser(req.headers.authorization);
    const { document_id } = req.query;

    let query = supabaseAdmin
      .from('sharing_events')
      .select(`
        id,
        document_id,
        shared_by,
        shared_with,
        requires_dual_auth,
        approval_status,
        access_expires_at,
        share_reason,
        created_at,
        documents (
          id,
          title,
          doc_type,
          sensitivity_level,
          case_id
        ),
        initiator:profiles!shared_by (
          id,
          name,
          role
        ),
        recipient:profiles!shared_with (
          id,
          name,
          role
        ),
        approvals (
          id,
          approver_id,
          decision,
          decided_at,
          approver:profiles!approver_id (
            name,
            role
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (document_id) {
      query = query.eq('document_id', document_id);
    }

    const { data: events, error } = await query;
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    let filteredEvents = events || [];
    if (userRole !== 'ADMIN' && userRole !== 'SUPERVISOR') {
      filteredEvents = filteredEvents.filter((e: any) => {
        const doc = Array.isArray(e.documents) ? e.documents[0] : e.documents;
        const caseId = doc?.case_id;
        return (
          e.shared_by === userId ||
          e.shared_with === userId ||
          (caseId && userCaseIds.includes(caseId))
        );
      });
    }

    return res.json({
      success: true,
      events: filteredEvents,
      count: filteredEvents.length,
    });
  } catch (err: any) {
    if (handleAuthError(res, err)) return;
    return res.status(500).json({ success: false, error: err?.message || 'Failed to list events.' });
  }
});
