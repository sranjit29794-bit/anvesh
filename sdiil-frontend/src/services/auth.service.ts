import { db, delay } from './api';
import { User, LoginResponse, MFAVerifyResponse, UserRole } from '@/types/auth.types';

// In-memory rate limiting counter (5 attempts per 10 minutes)
let loginAttempts = 0;
let lockoutUntil = 0;

export const authService = {
  /**
   * Primary authentication step (Username + Password)
   * Enforces 5-attempt rate limit, authenticates credentials, returns MFA challenge
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    await delay(300);

    const now = Date.now();
    if (lockoutUntil > now) {
      const waitSeconds = Math.ceil((lockoutUntil - now) / 1000);
      throw {
        error: 'rate_limit_exceeded',
        message: `Too many attempts. Account access temporarily paused. Try again in ${waitSeconds}s.`,
        support_reference: `REF-429-${Date.now()}`,
        retry_after: waitSeconds,
      };
    }

    loginAttempts += 1;
    if (loginAttempts > 5) {
      lockoutUntil = now + 60000; // 1 minute lockout for demo
      loginAttempts = 0;
      db.logAudit({
        user_id: 'unknown',
        username,
        action: 'LOGIN_FAILED',
        ip_address: '10.14.22.8',
        metadata: { reason: 'RATE_LIMIT_EXCEEDED' },
      });
      throw {
        error: 'rate_limit_exceeded',
        message: 'Too many attempts. Try again later.',
        support_reference: `REF-RATE-${Date.now()}`,
      };
    }

    // Find user (accept case-insensitive match, default demo password is 'securepassword' or any non-empty)
    const user = db.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!user || !password) {
      db.logAudit({
        user_id: user?.user_id || 'unresolved',
        username: username || 'anonymous',
        action: 'LOGIN_FAILED',
        ip_address: '10.14.22.8',
        metadata: { failure_reason: 'INVALID_CREDENTIALS' },
      });
      throw {
        error: 'authentication_failed',
        message: 'Invalid credentials. Please verify your username and password.',
        support_reference: `REF-AUTH-${Date.now()}`,
      };
    }

    if (user.account_status === 'LOCKED') {
      db.logAudit({
        user_id: user.user_id,
        username: user.username,
        action: 'LOGIN_FAILED',
        ip_address: '10.14.22.8',
        metadata: { failure_reason: 'ACCOUNT_LOCKED' },
      });
      throw {
        error: 'authentication_failed',
        message: 'Account is locked. Please contact your system administrator.',
        support_reference: `REF-LOCK-${Date.now()}`,
      };
    }

    // Generate short-lived session token for MFA step
    const sessionToken = btoa(
      JSON.stringify({
        userId: user.user_id,
        username: user.username,
        expiresAt: Date.now() + 300000, // 5 min
        mfaPending: true,
      })
    );

    return {
      mfa_required: true,
      mfa_method: user.mfa_method,
      session_token: sessionToken,
      masked_destination: user.email ? `${user.email.slice(0, 3)}***@${user.email.split('@')[1]}` : undefined,
    };
  },

  /**
   * MFA verification step (TOTP or OTP Code)
   * Generates scoped JWT containing user_id, role, case_ids, sensitivity_clearance
   */
  async verifyMFA(sessionToken: string, otpCode: string): Promise<MFAVerifyResponse> {
    await delay(300);

    let decoded: { userId: string; username: string; expiresAt: number };
    try {
      decoded = JSON.parse(atob(sessionToken));
    } catch {
      throw {
        error: 'authentication_failed',
        message: 'Invalid or expired MFA session. Please re-enter your credentials.',
        support_reference: `REF-MFA-MALFORMED-${Date.now()}`,
      };
    }

    if (Date.now() > decoded.expiresAt) {
      throw {
        error: 'authentication_failed',
        message: 'MFA session timed out. Please login again.',
        support_reference: `REF-MFA-EXP-${Date.now()}`,
      };
    }

    const user = db.users.find((u) => u.user_id === decoded.userId);
    if (!user) {
      throw {
        error: 'authentication_failed',
        message: 'User identity could not be verified.',
        support_reference: `REF-MFA-NOUSER-${Date.now()}`,
      };
    }

    // In prototype, any 6-digit number or default '123456' is accepted
    const cleanCode = otpCode.trim();
    if (!/^\d{6}$/.test(cleanCode) || cleanCode === '000000') {
      db.logAudit({
        user_id: user.user_id,
        username: user.username,
        action: 'MFA_FAILED',
        ip_address: '10.14.22.8',
        metadata: { mfa_method: user.mfa_method, code_entered: cleanCode },
      });
      throw {
        error: 'authentication_failed',
        message: 'Invalid or expired verification code.',
        support_reference: `REF-MFA-INVALID-${Date.now()}`,
      };
    }

    // Reset login attempts counter on success
    loginAttempts = 0;
    user.failed_attempts = 0;
    user.last_login = new Date().toISOString();

    // Create RS256-equivalent Mock Scoped JWT
    const jwtPayload = {
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      department: user.department,
      case_ids: user.case_ids,
      sensitivity_clearance: user.sensitivity_clearance,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 28800, // 8 hours
    };

    const mockAccessToken = `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(
      JSON.stringify(jwtPayload)
    )}.SIG_RSA_${Date.now()}`;

    // Log success in immutable audit log
    db.logAudit({
      user_id: user.user_id,
      username: user.username,
      action: 'LOGIN_SUCCESS',
      ip_address: '10.14.22.8',
      metadata: { role: user.role, case_count: user.case_ids.length },
    });

    return {
      access_token: mockAccessToken,
      token_type: 'Bearer',
      expires_in: 28800,
      role: user.role,
      case_count: user.case_ids.length,
      user,
    };
  },

  /**
   * Admin: List all users
   */
  async getUsers(): Promise<User[]> {
    await delay(150);
    return [...db.users];
  },

  /**
   * Admin: Update user status or assign role/cases
   */
  async updateUser(
    adminUserId: string,
    targetUserId: string,
    updates: Partial<User>
  ): Promise<User> {
    await delay(200);
    const user = db.users.find((u) => u.user_id === targetUserId);
    if (!user) throw new Error('User not found');

    const admin = db.users.find((u) => u.user_id === adminUserId);

    Object.assign(user, updates);

    // If role changed, recompute sensitivity clearance
    if (updates.role) {
      if (['INVESTIGATOR', 'SUPERVISOR', 'ADMIN'].includes(updates.role)) {
        user.sensitivity_clearance = 'A';
      } else if (['PROSECUTOR', 'FORENSIC_OFFICER', 'REVIEWER'].includes(updates.role)) {
        user.sensitivity_clearance = 'B';
      } else {
        user.sensitivity_clearance = 'C';
      }
    }

    db.logAudit({
      user_id: adminUserId,
      username: admin?.username || 'admin',
      action: 'ADMIN_USER_MODIFIED',
      ip_address: '10.14.22.8',
      metadata: { target_user_id: targetUserId, updates },
    });

    return { ...user };
  },

  /**
   * Quick role-switch helper for prototype testing
   */
  async switchRoleForTesting(targetRole: UserRole): Promise<User> {
    const user = db.users.find((u) => u.role === targetRole) || db.users[0];
    return { ...user };
  },
};
