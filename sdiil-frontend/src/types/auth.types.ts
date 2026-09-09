export type UserRole =
  | 'INVESTIGATOR'
  | 'SUPERVISOR'
  | 'ADMIN'
  | 'PROSECUTOR'
  | 'FORENSIC_OFFICER'
  | 'COURT_REGISTRAR'
  | 'REVIEWER';

export type SensitivityClearance = 'A' | 'B' | 'C';

export type AccountStatus = 'ACTIVE' | 'LOCKED' | 'PENDING_ACTIVATION';

export type MFAMethod = 'TOTP' | 'EMAIL_OTP';

export interface User {
  user_id: string;
  username: string;
  full_name: string;
  role: UserRole;
  department: string;
  badge_number?: string;
  email: string;
  account_status: AccountStatus;
  mfa_method: MFAMethod;
  case_ids: string[];
  sensitivity_clearance: SensitivityClearance;
  failed_attempts: number;
  last_login?: string;
  created_at: string;
}

export interface JWTPayload {
  user_id: string;
  username: string;
  role: UserRole;
  department: string;
  case_ids: string[];
  sensitivity_clearance: SensitivityClearance;
  iat: number;
  exp: number;
}

export interface LoginResponse {
  mfa_required: boolean;
  mfa_method: MFAMethod;
  session_token: string;
  masked_destination?: string;
}

export interface MFAVerifyResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  role: UserRole;
  case_count: number;
  user: User;
}

export interface AuthError {
  error: string;
  message: string;
  support_reference: string;
  retry_after?: number;
}
