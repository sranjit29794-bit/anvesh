import { Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export interface ResolvedUser {
  userId: string;
  userRole: string;
  userCaseIds: string[];
  email?: string;
  profile?: any;
}

/**
 * Resolves the authenticated user from the incoming Bearer JWT.
 * 
 * ARCHITECTURAL RULE:
 * GoTrue JWTs do NOT contain case_ids. The backend must NEVER expect case_ids in JWT claims.
 * Instead, resolveUser:
 * 1. Validates the JWT and extracts user_id via supabaseAdmin.auth.getUser(jwt)
 * 2. Fetches official userRole and account_status from profiles table
 * 3. Fetches userCaseIds directly from case_assignments table
 */
export async function resolveUser(authHeader: string | undefined): Promise<ResolvedUser> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED');
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    throw new Error('UNAUTHORIZED');
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !user) {
    console.error('[resolveUser] auth.getUser error:', error?.message, 'user:', !!user);
    throw new Error('UNAUTHORIZED');
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('role, account_status')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) {
    console.error('[resolveUser] profile error:', profileErr?.message, 'profile:', !!profile);
    throw new Error('UNAUTHORIZED');
  }
  if (profile.account_status === 'LOCKED') {
    throw new Error('ACCOUNT_LOCKED');
  }

  const { data: assignments } = await supabaseAdmin
    .from('case_assignments')
    .select('case_id')
    .eq('user_id', user.id);

  const userCaseIds = (assignments || []).map((a: any) => a.case_id);

  return {
    userId: user.id,
    userRole: (profile.role || '').toUpperCase(),
    userCaseIds,
    email: user.email,
    profile,
  };
}

/**
 * Handles standard authentication and authorization errors thrown by resolveUser.
 * Returns true if an error response was sent.
 */
export function handleAuthError(res: Response, e: any): boolean {
  if (e?.message === 'UNAUTHORIZED') {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return true;
  }
  if (e?.message === 'ACCOUNT_LOCKED') {
    res.status(403).json({ success: false, error: 'Account locked' });
    return true;
  }
  if (e?.message === 'PASSWORD_CHANGE_REQUIRED') {
    res.status(403).json({
      success: false,
      error: 'Password change required',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
    return true;
  }
  return false;
}
