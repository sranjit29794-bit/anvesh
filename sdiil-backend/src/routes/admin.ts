import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { createUserClient } from '../lib/supabaseUser.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export const adminRouter = Router();

/**
 * Helper: Validates that the request comes from an authenticated user with role = 'ADMIN'.
 * Returns caller details or responds with 401/403 and returns null.
 */
async function verifyAdminCaller(
  req: Request,
  res: Response
): Promise<{ callerId: string; callerRole: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authorization header with Bearer JWT is required.' });
    return null;
  }

  try {
    const userClient = createUserClient(authHeader);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      res.status(401).json({ success: false, error: 'Invalid or expired session token.' });
      return null;
    }

    const callerId = userData.user.id;
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, name, role')
      .eq('id', callerId)
      .maybeSingle();

    if (profileErr || !profile) {
      res.status(403).json({ success: false, error: 'Caller profile not found or access denied.' });
      return null;
    }

    const role = (profile.role || '').toUpperCase();
    if (role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Forbidden: Administrator clearance required.' });
      return null;
    }

    return { callerId, callerRole: role };
  } catch (err: any) {
    res.status(401).json({ success: false, error: err?.message || 'Authentication error.' });
    return null;
  }
}

/**
 * Helper: Resolve case number or case UUID to UUID
 */
async function resolveCaseUuid(caseIdParam: string): Promise<string | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseIdParam);
  if (isUuid) return caseIdParam;

  const { data } = await supabaseAdmin
    .from('cases')
    .select('id')
    .eq('case_number', caseIdParam)
    .maybeSingle();

  return data?.id || null;
}

/**
 * Generates a cryptographically strong 12-character temporary password.
 */
function generateSecureTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + numbers + special;

  let pwd = '';
  pwd += upper[crypto.randomInt(0, upper.length)];
  pwd += lower[crypto.randomInt(0, lower.length)];
  pwd += numbers[crypto.randomInt(0, numbers.length)];
  pwd += special[crypto.randomInt(0, special.length)];

  for (let i = 4; i < 12; i++) {
    pwd += all[crypto.randomInt(0, all.length)];
  }

  // Shuffle
  return pwd
    .split('')
    .sort(() => crypto.randomInt(-1, 2))
    .join('');
}

// ============================================================================
// USER MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/admin/users
 * Provision a new officer/judge account in Supabase Auth & profiles table.
 */
adminRouter.post('/users', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    const { email, full_name, role, department } = req.body;

    if (!email || !full_name || !role) {
      return res.status(400).json({
        success: false,
        error: 'Missing required user parameters: email, full_name, and role are mandatory.',
      });
    }

    const tempPassword = generateSecureTempPassword();

    // 1. Create auth user with temp password and confirmed email
    const { data: authCreated, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name: full_name.trim(),
        role: role.trim().toLowerCase(),
        department: department?.trim() || 'Investigation',
      },
    });

    if (authError || !authCreated?.user) {
      return res.status(400).json({
        success: false,
        error: `Failed to provision user in Supabase Auth: ${authError?.message}`,
      });
    }

    const newUserId = authCreated.user.id;

    // 2. Insert profile record in public.profiles table
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: newUserId,
      name: full_name.trim(),
      role: role.trim().toLowerCase(),
      department: department?.trim() || 'Investigation',
      account_status: 'ACTIVE',
      is_locked: false,
      created_at: new Date().toISOString(),
    });

    if (profileError) {
      // Rollback auth user if profile insertion failed
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return res.status(500).json({
        success: false,
        error: `Failed to insert profile record: ${profileError.message}`,
      });
    }

    // 3. Write immutable audit log entry
    await supabaseAdmin.from('audit_log').insert({
      user_id: adminCaller.callerId,
      action: 'admin_create_user',
      resource_type: 'user',
      resource_id: newUserId,
      ip_address: req.ip || '127.0.0.1',
      metadata: {
        new_user_email: email.trim().toLowerCase(),
        new_user_role: role.trim().toUpperCase(),
        department: department?.trim() || 'Investigation',
        full_name: full_name.trim(),
        provisioned_by: adminCaller.callerId,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'User provisioned successfully.',
      user: {
        id: newUserId,
        email: email.trim().toLowerCase(),
        full_name: full_name.trim(),
        role: role.trim().toUpperCase(),
        department: department?.trim() || 'Investigation',
        account_status: 'ACTIVE',
      },
      temp_password: tempPassword,
    });
  } catch (err: any) {
    console.error('[AdminRouter] Error provisioning user:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

/**
 * GET /api/v1/admin/users
 * List all users with profiles, auth data, and assigned case counts.
 */
adminRouter.get('/users', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    // 1. Fetch all profiles
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profErr) {
      return res.status(500).json({ success: false, error: profErr.message });
    }

    // 2. Fetch auth users to correlate email and sign-in stats
    const { data: authUsersData, error: authUsersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (authUsersErr) {
      return res.status(500).json({ success: false, error: authUsersErr.message });
    }

    const authMap = new Map<string, any>();
    for (const u of authUsersData.users) {
      authMap.set(u.id, u);
    }

    // 3. Fetch case assignment counts
    const { data: assignments, error: assignErr } = await supabaseAdmin
      .from('case_assignments')
      .select('user_id');

    const caseCountMap = new Map<string, number>();
    if (!assignErr && assignments) {
      for (const a of assignments) {
        caseCountMap.set(a.user_id, (caseCountMap.get(a.user_id) || 0) + 1);
      }
    }

    // 4. Combine and format
    const users = (profiles || []).map((p: any) => {
      const authUser = authMap.get(p.id);
      const isLocked = p.is_locked || p.account_status === 'LOCKED' || Boolean(authUser?.banned_until);

      return {
        id: p.id,
        email: authUser?.email || '',
        full_name: p.name || 'Unnamed Officer',
        role: (p.role || '').toUpperCase(),
        department: p.department || 'Investigation',
        account_status: isLocked ? 'LOCKED' : (p.account_status || 'ACTIVE'),
        case_count: caseCountMap.get(p.id) || 0,
        created_at: p.created_at || authUser?.created_at,
        last_sign_in_at: authUser?.last_sign_in_at || null,
      };
    });

    return res.status(200).json({ success: true, users });
  } catch (err: any) {
    console.error('[AdminRouter] Error listing users:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

/**
 * PATCH /api/v1/admin/users/:userId/role
 * Update user judicial / investigative role in profiles table.
 */
adminRouter.patch('/users/:userId/role', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ success: false, error: 'Target role is required.' });
    }

    const normalizedRole = role.trim().toLowerCase();

    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ role: normalizedRole })
      .eq('id', userId);

    if (updateErr) {
      return res.status(500).json({ success: false, error: updateErr.message });
    }

    // Update Supabase auth metadata as well
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { role: normalizedRole },
    });

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      user_id: adminCaller.callerId,
      action: 'admin_update_role',
      resource_type: 'user',
      resource_id: userId,
      ip_address: req.ip || '127.0.0.1',
      metadata: { new_role: role.trim().toUpperCase(), updated_by: adminCaller.callerId },
    });

    return res.status(200).json({
      success: true,
      message: 'User role updated successfully.',
      userId,
      role: role.trim().toUpperCase(),
    });
  } catch (err: any) {
    console.error('[AdminRouter] Error updating role:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

/**
 * PATCH /api/v1/admin/users/:userId/lock
 * Lock profile and ban auth account to invalidate active JWTs immediately.
 */
adminRouter.patch('/users/:userId/lock', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    const { userId } = req.params;

    // 1. Update profiles table
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .update({ is_locked: true, account_status: 'LOCKED' })
      .eq('id', userId);

    if (profileErr) {
      return res.status(500).json({ success: false, error: profileErr.message });
    }

    // 2. Ban user in Supabase Auth (e.g. 100 years ban so existing JWTs are rejected immediately)
    const { error: authBanErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: '876000h',
    });

    if (authBanErr) {
      console.warn('[AdminRouter] Notice: auth ban update:', authBanErr.message);
    }

    // 3. Audit log
    await supabaseAdmin.from('audit_log').insert({
      user_id: adminCaller.callerId,
      action: 'admin_lock_user',
      resource_type: 'user',
      resource_id: userId,
      ip_address: req.ip || '127.0.0.1',
      metadata: { status: 'LOCKED', locked_by: adminCaller.callerId },
    });

    return res.status(200).json({
      success: true,
      message: 'User account locked and banned successfully.',
      userId,
    });
  } catch (err: any) {
    console.error('[AdminRouter] Error locking user:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

/**
 * PATCH /api/v1/admin/users/:userId/unlock
 * Unlock profile and remove auth ban.
 */
adminRouter.patch('/users/:userId/unlock', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    const { userId } = req.params;

    // 1. Update profiles table
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .update({ is_locked: false, account_status: 'ACTIVE' })
      .eq('id', userId);

    if (profileErr) {
      return res.status(500).json({ success: false, error: profileErr.message });
    }

    // 2. Unban user in Supabase Auth
    const { error: authUnbanErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    });

    if (authUnbanErr) {
      console.warn('[AdminRouter] Notice: auth unban update:', authUnbanErr.message);
    }

    // 3. Audit log
    await supabaseAdmin.from('audit_log').insert({
      user_id: adminCaller.callerId,
      action: 'admin_unlock_user',
      resource_type: 'user',
      resource_id: userId,
      ip_address: req.ip || '127.0.0.1',
      metadata: { status: 'ACTIVE', unlocked_by: adminCaller.callerId },
    });

    return res.status(200).json({
      success: true,
      message: 'User account unlocked successfully.',
      userId,
    });
  } catch (err: any) {
    console.error('[AdminRouter] Error unlocking user:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

/**
 * PATCH /api/v1/admin/users/:userId/reset-mfa
 * Reset and unenroll all MFA factors for the user so they must re-enroll on next sign-in.
 */
adminRouter.patch('/users/:userId/reset-mfa', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    const { userId } = req.params;

    // 1. Unenroll all MFA factors
    try {
      const { data: factorsData, error: factorsErr } = await supabaseAdmin.auth.admin.mfa.listFactors({
        userId,
      });

      if (!factorsErr && factorsData?.factors) {
        for (const factor of factorsData.factors) {
          await supabaseAdmin.auth.admin.mfa.deleteFactor({
            id: factor.id,
            userId,
          });
        }
      }
    } catch (mfaErr: any) {
      console.warn('[AdminRouter] MFA factors unenroll notice:', mfaErr?.message);
    }

    // 2. Audit log
    await supabaseAdmin.from('audit_log').insert({
      user_id: adminCaller.callerId,
      action: 'admin_reset_mfa',
      resource_type: 'user',
      resource_id: userId,
      ip_address: req.ip || '127.0.0.1',
      metadata: { mfa_reset: true, reset_by: adminCaller.callerId },
    });

    return res.status(200).json({
      success: true,
      message: 'MFA factors reset successfully. User must re-enroll upon next sign-in.',
      userId,
    });
  } catch (err: any) {
    console.error('[AdminRouter] Error resetting MFA:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

// ============================================================================
// CASE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/admin/cases
 * Provision a new case folder.
 */
adminRouter.post('/cases', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    const { case_id, title, description, department, status } = req.body;

    if (!case_id || !title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required case parameters: case_id and title are mandatory.',
      });
    }

    const { data: newCase, error: insertErr } = await supabaseAdmin
      .from('cases')
      .insert({
        case_number: case_id.trim().toUpperCase(),
        title: title.trim(),
        description: description?.trim() || '',
        department: department?.trim() || 'Crime Branch',
        status: (status || 'open').toLowerCase(),
        created_by: adminCaller.callerId,
      })
      .select()
      .single();

    if (insertErr || !newCase) {
      return res.status(400).json({
        success: false,
        error: `Failed to create case: ${insertErr?.message}`,
      });
    }

    // Auto-assign the admin creator to the new case
    await supabaseAdmin.from('case_assignments').upsert({
      case_id: newCase.id,
      user_id: adminCaller.callerId,
      role_in_case: 'ADMIN',
    });

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      user_id: adminCaller.callerId,
      action: 'admin_create_case',
      resource_type: 'case',
      resource_id: newCase.id,
      case_id: newCase.id,
      ip_address: req.ip || '127.0.0.1',
      metadata: {
        case_number: case_id.trim().toUpperCase(),
        title: title.trim(),
        department: department?.trim() || 'Crime Branch',
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Case folder created successfully.',
      case: newCase,
    });
  } catch (err: any) {
    console.error('[AdminRouter] Error creating case:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

/**
 * GET /api/v1/admin/cases
 * List all cases with document and assigned user counts.
 */
adminRouter.get('/cases', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    const { data: cases, error: casesErr } = await supabaseAdmin
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false });

    if (casesErr) {
      return res.status(500).json({ success: false, error: casesErr.message });
    }

    // Fetch documents counts
    const { data: docs } = await supabaseAdmin.from('documents').select('case_id');
    const docCountMap = new Map<string, number>();
    if (docs) {
      for (const d of docs) {
        docCountMap.set(d.case_id, (docCountMap.get(d.case_id) || 0) + 1);
      }
    }

    // Fetch assignments and assigned user details
    const { data: assignments } = await supabaseAdmin
      .from('case_assignments')
      .select(`
        id,
        case_id,
        user_id,
        role_in_case,
        assigned_at,
        profiles:user_id (id, name, role, department)
      `);

    const assignCountMap = new Map<string, number>();
    const assignmentsByCase = new Map<string, any[]>();

    if (assignments) {
      for (const a of assignments) {
        assignCountMap.set(a.case_id, (assignCountMap.get(a.case_id) || 0) + 1);
        if (!assignmentsByCase.has(a.case_id)) {
          assignmentsByCase.set(a.case_id, []);
        }
        assignmentsByCase.get(a.case_id)?.push(a);
      }
    }

    const casesWithCounts = (cases || []).map((c: any) => ({
      ...c,
      case_id: c.case_number,
      document_count: docCountMap.get(c.id) || 0,
      assigned_user_count: assignCountMap.get(c.id) || 0,
      assigned_users: assignmentsByCase.get(c.id) || [],
    }));

    return res.status(200).json({ success: true, cases: casesWithCounts });
  } catch (err: any) {
    console.error('[AdminRouter] Error listing cases:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

/**
 * POST /api/v1/admin/cases/:caseId/assign
 * Assign a user to a case.
 */
adminRouter.post('/cases/:caseId/assign', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    const { caseId } = req.params;
    const { userId, role_in_case } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is mandatory.' });
    }

    const caseUuid = await resolveCaseUuid(caseId);
    if (!caseUuid) {
      return res.status(404).json({ success: false, error: `Case '${caseId}' not found.` });
    }

    // Insert or update case assignment
    const { data: assignment, error: assignErr } = await supabaseAdmin
      .from('case_assignments')
      .upsert(
        {
          case_id: caseUuid,
          user_id: userId,
          role_in_case: role_in_case?.trim().toUpperCase() || 'INVESTIGATOR',
          assigned_at: new Date().toISOString(),
        },
        { onConflict: 'case_id,user_id' }
      )
      .select()
      .single();

    if (assignErr) {
      return res.status(500).json({ success: false, error: assignErr.message });
    }

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      user_id: adminCaller.callerId,
      action: 'admin_assign_user',
      resource_type: 'case',
      resource_id: caseUuid,
      case_id: caseUuid,
      ip_address: req.ip || '127.0.0.1',
      metadata: {
        assigned_user_id: userId,
        role_in_case: role_in_case || 'INVESTIGATOR',
        assigned_by: adminCaller.callerId,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'User assigned to case successfully.',
      assignment,
    });
  } catch (err: any) {
    console.error('[AdminRouter] Error assigning user:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

/**
 * DELETE /api/v1/admin/cases/:caseId/assign/:userId
 * Remove a user from a case.
 */
adminRouter.delete('/cases/:caseId/assign/:userId', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    const { caseId, userId } = req.params;

    const caseUuid = await resolveCaseUuid(caseId);
    if (!caseUuid) {
      return res.status(404).json({ success: false, error: `Case '${caseId}' not found.` });
    }

    const { error: deleteErr } = await supabaseAdmin
      .from('case_assignments')
      .delete()
      .eq('case_id', caseUuid)
      .eq('user_id', userId);

    if (deleteErr) {
      return res.status(500).json({ success: false, error: deleteErr.message });
    }

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      user_id: adminCaller.callerId,
      action: 'admin_remove_user',
      resource_type: 'case',
      resource_id: caseUuid,
      case_id: caseUuid,
      ip_address: req.ip || '127.0.0.1',
      metadata: {
        removed_user_id: userId,
        removed_by: adminCaller.callerId,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'User removed from case successfully.',
    });
  } catch (err: any) {
    console.error('[AdminRouter] Error removing user from case:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});

// ============================================================================
// SYSTEM STATS ENDPOINT
// ============================================================================

/**
 * GET /api/v1/admin/stats
 * Cross-system aggregated statistics (unrestricted by RLS via service role).
 */
adminRouter.get('/stats', async (req: Request, res: Response) => {
  const adminCaller = await verifyAdminCaller(req, res);
  if (!adminCaller) return;

  try {
    const [
      usersRes,
      casesRes,
      docsRes,
      auditRes,
      anomaliesRes,
      sharesRes,
      approvalsRes,
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('id', { count: 'exact' }).limit(1),
      supabaseAdmin.from('cases').select('id', { count: 'exact' }).limit(1),
      supabaseAdmin.from('documents').select('id', { count: 'exact' }).limit(1),
      supabaseAdmin.from('audit_log').select('id', { count: 'exact' }).limit(1),
      supabaseAdmin.from('anomaly_flags').select('id', { count: 'exact' }).eq('acknowledged', false).limit(1),
      supabaseAdmin.from('sharing_events').select('id', { count: 'exact' }).gt('access_expires_at', new Date().toISOString()).limit(1),
      supabaseAdmin.from('sharing_events').select('id', { count: 'exact' }).eq('approval_status', 'pending').limit(1),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        total_users: typeof usersRes.count === 'number' ? usersRes.count : 0,
        total_cases: typeof casesRes.count === 'number' ? casesRes.count : 0,
        total_documents: typeof docsRes.count === 'number' ? docsRes.count : 0,
        total_audit_events: typeof auditRes.count === 'number' ? auditRes.count : 0,
        unacknowledged_anomalies: typeof anomaliesRes.count === 'number' ? anomaliesRes.count : 0,
        active_shares: typeof sharesRes.count === 'number' ? sharesRes.count : 0,
        pending_approvals: typeof approvalsRes.count === 'number' ? approvalsRes.count : 0,
      },
    });
  } catch (err: any) {
    console.error('[AdminRouter] Error computing system stats:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error.' });
  }
});
