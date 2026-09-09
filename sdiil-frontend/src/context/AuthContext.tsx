import React, { createContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '@/types/auth.types';
import { supabase } from '@/services/supabase.client';
import { authService } from '@/services/auth.service';

export interface CaseAssignmentRecord {
  id: string;
  case_id: string;
  role_in_case: string;
  cases: {
    id: string;
    case_number: string;
    title: string;
    status: string;
  } | null;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  role: string | null;
  caseAssignments: CaseAssignmentRecord[];
  isAuthenticated: boolean;
  isMfaPending: boolean;
  mfaSessionToken: string | null;
  mfaMethod: string | null;
  mfaDestination?: string;
  mfaChallengeId?: string | null;
  mfaFactorId?: string | null;
  pendingEmail?: string | null;
  login: (usernameOrEmail: string, pass: string) => Promise<{ mfaRequired: boolean }>;
  verifyMfa: (code: string) => Promise<void>;
  cancelMfa: () => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [caseAssignments, setCaseAssignments] = useState<CaseAssignmentRecord[]>([]);
  const [isMfaPending, setIsMfaPending] = useState(false);
  const [mfaMethod, setMfaMethod] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  /**
   * Helper to load profile record and case assignments for authenticated user
   */
  const loadUserProfile = useCallback(async (sessionUser: any, accessToken: string) => {
    try {
      // 1. Fetch profile record from Supabase 'profiles' table
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .single();

      // 2. Fetch case assignments joined with cases table
      const { data: assignments } = await supabase
        .from('case_assignments')
        .select('id, case_id, role_in_case, cases(id, case_number, title, status)')
        .eq('user_id', sessionUser.id);

      const rawAssignments = (assignments || []) as unknown as CaseAssignmentRecord[];
      const caseIds = rawAssignments.map((a) => a.case_id);

      const profileRole = (profile?.role || sessionUser.user_metadata?.role || 'officer').toLowerCase();
      let userRole: UserRole = 'INVESTIGATOR';
      if (profileRole === 'supervisor') userRole = 'SUPERVISOR';
      else if (profileRole === 'admin') userRole = 'ADMIN';
      else if (profileRole === 'judge' || profileRole === 'court_registrar') userRole = 'COURT_REGISTRAR';
      else if (profileRole === 'prosecutor') userRole = 'PROSECUTOR';
      else if (profileRole === 'forensic_officer') userRole = 'FORENSIC_OFFICER';
      else if (profileRole === 'reviewer') userRole = 'REVIEWER';

      // Determine sensitivity clearance based on role
      let sensitivity_clearance: 'A' | 'B' | 'C' = 'C';
      if (userRole === 'ADMIN' || userRole === 'SUPERVISOR' || userRole === 'INVESTIGATOR') {
        sensitivity_clearance = 'A';
      } else if (userRole === 'PROSECUTOR' || userRole === 'FORENSIC_OFFICER') {
        sensitivity_clearance = 'B';
      }

      const mappedUser: User = {
        user_id: sessionUser.id,
        username: sessionUser.email?.split('@')[0] || profile?.name || 'officer',
        full_name: profile?.name || sessionUser.user_metadata?.name || 'Authorized Officer',
        email: sessionUser.email || 'officer.demo@sdiil.test',
        role: userRole,
        department: sessionUser.user_metadata?.department || 'Crime Branch, Special Cell',
        case_ids: caseIds,
        sensitivity_clearance,
        account_status: profile?.is_locked ? 'LOCKED' : 'ACTIVE',
        mfa_method: 'TOTP',
        failed_attempts: 0,
        created_at: sessionUser.created_at || new Date().toISOString(),
      };

      setUser(mappedUser);
      setToken(accessToken);
      setRole(profile?.role || profileRole);
      setCaseAssignments(rawAssignments);
    } catch (err) {
      console.error('[AuthContext] Failed to load profile & assignments:', err);
    }
  }, []);

  // Initialize session from Supabase default browser storage
  useEffect(() => {
    const initSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user || !session.access_token) {
          setUser(null);
          setToken(null);
          setRole(null);
          setCaseAssignments([]);
          setIsMfaPending(false);
          return;
        }

        // Check MFA Assurance Level (AAL)
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        const factorsRes = await supabase.auth.mfa.listFactors();
        const verifiedTotp = factorsRes.data?.totp.find((f) => f.status === 'verified');

        if (verifiedTotp && aal && aal.currentLevel !== 'aal2') {
          // Session is at aal1 but user has enrolled verified TOTP -> Require MFA challenge
          const challenge = await supabase.auth.mfa.challenge({ factorId: verifiedTotp.id });
          if (challenge.data) {
            setIsMfaPending(true);
            setMfaMethod('TOTP');
            setMfaFactorId(verifiedTotp.id);
            setMfaChallengeId(challenge.data.id);
            setPendingEmail(session.user.email || null);
            setUser(null);
            setToken(null);
            return;
          }
        }

        // Full session valid (either AAL2 or no factor enrolled)
        setIsMfaPending(false);
        await loadUserProfile(session.user, session.access_token);
      } catch (err) {
        console.error('[AuthContext] Session init error:', err);
        setUser(null);
        setToken(null);
        setIsMfaPending(false);
      }
    };

    initSession();

    // Listen to Supabase Auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setToken(null);
        setRole(null);
        setCaseAssignments([]);
        setIsMfaPending(false);
        setMfaFactorId(null);
        setMfaChallengeId(null);
        setPendingEmail(null);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel === 'aal2' || aal?.nextLevel !== 'aal2') {
          await loadUserProfile(session.user, session.access_token);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadUserProfile]);

  /**
   * Real Supabase Login: signInWithPassword + MFA factor detection
   */
  const login = async (usernameOrEmail: string, pass: string) => {
    const email = usernameOrEmail.includes('@')
      ? usernameOrEmail.trim()
      : `${usernameOrEmail.toLowerCase().trim()}@sdiil.test`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error) {
      throw new Error(error.message || 'Authentication failed. Please verify your credentials.');
    }

    if (!data.session || !data.user) {
      throw new Error('Failed to establish authentication session.');
    }

    // Check MFA enrollment via listFactors and AAL
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const factorsRes = await supabase.auth.mfa.listFactors();
    const verifiedTotp = factorsRes.data?.totp.find((f) => f.status === 'verified');

    if (verifiedTotp && aal && aal.currentLevel !== 'aal2') {
      // User has enrolled TOTP factor -> Issue challenge and halt before granting session
      const challenge = await supabase.auth.mfa.challenge({ factorId: verifiedTotp.id });
      if (challenge.error || !challenge.data) {
        throw new Error(`MFA challenge initiation failed: ${challenge.error?.message}`);
      }

      setIsMfaPending(true);
      setMfaMethod('TOTP');
      setMfaFactorId(verifiedTotp.id);
      setMfaChallengeId(challenge.data.id);
      setPendingEmail(data.user.email || null);
      setUser(null);
      setToken(null);
      return { mfaRequired: true };
    }

    // No MFA factor enrolled -> grant full session
    await loadUserProfile(data.user, data.session.access_token);
    setIsMfaPending(false);
    return { mfaRequired: false };
  };

  /**
   * Supabase TOTP MFA Verification
   */
  const verifyMfa = async (code: string) => {
    if (!mfaFactorId || !mfaChallengeId) {
      throw new Error('No active MFA challenge found. Please re-authenticate.');
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: mfaChallengeId,
      code: code.trim(),
    });

    if (error) {
      throw new Error(error.message || 'Invalid or expired 6-digit TOTP code.');
    }

    // Session is now elevated to AAL2
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session || !session.user) {
      throw new Error('Verified session could not be established.');
    }

    await loadUserProfile(session.user, session.access_token);
    setIsMfaPending(false);
    setMfaFactorId(null);
    setMfaChallengeId(null);
    setMfaMethod(null);
    setPendingEmail(null);
  };

  const cancelMfa = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setIsMfaPending(false);
    setMfaMethod(null);
    setMfaFactorId(null);
    setMfaChallengeId(null);
    setPendingEmail(null);
    setUser(null);
    setToken(null);
    setRole(null);
    setCaseAssignments([]);
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore signOut errors
    }
    setUser(null);
    setToken(null);
    setRole(null);
    setCaseAssignments([]);
    setIsMfaPending(false);
    setMfaFactorId(null);
    setMfaChallengeId(null);
    setPendingEmail(null);
  };

  const switchRole = async (targetRole: UserRole) => {
    const switchedUser = await authService.switchRoleForTesting(targetRole);
    setUser(switchedUser);
    setRole(targetRole.toLowerCase());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role,
        caseAssignments,
        isAuthenticated: Boolean(user && token && !isMfaPending),
        isMfaPending,
        mfaSessionToken: null,
        mfaMethod,
        mfaDestination: pendingEmail || undefined,
        mfaChallengeId,
        mfaFactorId,
        pendingEmail,
        login,
        verifyMfa,
        cancelMfa,
        logout,
        switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
