import { UserRole, SensitivityClearance, User } from '@/types/auth.types';
import { SensitivityLevel, DocType, DocumentRecord } from '@/types/document.types';

export const ROLE_SENSITIVITY_CLEARANCE: Record<UserRole, SensitivityClearance[]> = {
  INVESTIGATOR: ['A', 'B', 'C'],
  SUPERVISOR: ['A', 'B', 'C'],
  ADMIN: ['A', 'B', 'C'],
  PROSECUTOR: ['B', 'C'],
  FORENSIC_OFFICER: ['B', 'C'],
  REVIEWER: ['B', 'C'],
  COURT_REGISTRAR: ['C'],
};

export interface ABACPermissionResult {
  allowed: boolean;
  reason?: string;
  badgeMessage?: string;
}

/**
 * Checks if user is assigned to the case
 */
export function isUserAssignedToCase(user: User | null, caseId: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return user.case_ids.includes(caseId);
}

/**
 * Checks if user role has clearance for a given sensitivity level
 */
export function hasSensitivityClearance(role: UserRole, level: SensitivityLevel): boolean {
  const allowed = ROLE_SENSITIVITY_CLEARANCE[role] || [];
  return allowed.includes(level);
}

/**
 * ABAC check for viewing a document
 */
export function canViewDocument(user: User | null, doc: DocumentRecord): ABACPermissionResult {
  if (!user) {
    return { allowed: false, reason: 'Authentication required' };
  }

  if (!isUserAssignedToCase(user, doc.case_id)) {
    return {
      allowed: false,
      reason: `User is not assigned to Case ${doc.case_id.slice(0, 8)}`,
      badgeMessage: 'Unassigned Case',
    };
  }

  if (!hasSensitivityClearance(user.role, doc.sensitivity_level)) {
    return {
      allowed: false,
      reason: `Role '${user.role}' lacks clearance for Sensitivity-${doc.sensitivity_level} materials`,
      badgeMessage: 'Clearance Locked',
    };
  }

  return { allowed: true };
}

/**
 * ABAC check for downloading a document
 */
export function canDownloadDocument(user: User | null, doc: DocumentRecord): ABACPermissionResult {
  const viewCheck = canViewDocument(user, doc);
  if (!viewCheck.allowed) return viewCheck;

  // Reviewers and Court Registrars can view authorized docs but cannot download offline copies
  if (user?.role === 'REVIEWER') {
    return {
      allowed: false,
      reason: 'Role REVIEWER is restricted to read-only browser inspection',
      badgeMessage: 'Download Restricted',
    };
  }

  return { allowed: true };
}

/**
 * ABAC check for uploading documents
 */
export function canUploadDocument(user: User | null, caseId: string, docType?: DocType): ABACPermissionResult {
  if (!user) return { allowed: false, reason: 'Authentication required' };

  if (!isUserAssignedToCase(user, caseId)) {
    return {
      allowed: false,
      reason: 'You are not assigned to this case',
      badgeMessage: 'Unassigned Case',
    };
  }

  if (user.role === 'COURT_REGISTRAR') {
    return {
      allowed: false,
      reason: 'Role COURT_REGISTRAR has read-only court registry privileges (no upload)',
      badgeMessage: 'Upload Disabled for Registrar',
    };
  }

  if (user.role === 'REVIEWER') {
    return {
      allowed: false,
      reason: 'Role REVIEWER has read-only review privileges (no upload)',
      badgeMessage: 'Upload Disabled for Reviewer',
    };
  }

  if (user.role === 'PROSECUTOR') {
    return {
      allowed: false,
      reason: 'Role PROSECUTOR receives evidence via controlled sharing (no direct upload)',
      badgeMessage: 'Upload Disabled for Prosecutor',
    };
  }

  if (user.role === 'FORENSIC_OFFICER') {
    if (docType && docType !== 'FORENSIC_REPORT') {
      return {
        allowed: false,
        reason: 'Forensic Officers are restricted strictly to FORENSIC_REPORT uploads',
        badgeMessage: 'FORENSIC_REPORT only',
      };
    }
    return { allowed: true };
  }

  // INVESTIGATOR, SUPERVISOR, ADMIN
  return { allowed: true };
}

/**
 * ABAC check for initiating a share
 */
export function canInitiateShare(user: User | null, doc: DocumentRecord): ABACPermissionResult {
  if (!user) return { allowed: false, reason: 'Authentication required' };

  if (!isUserAssignedToCase(user, doc.case_id)) {
    return {
      allowed: false,
      reason: 'You are not assigned to this case',
      badgeMessage: 'Unassigned Case',
    };
  }

  if (!hasSensitivityClearance(user.role, doc.sensitivity_level)) {
    return {
      allowed: false,
      reason: `Insufficient clearance for Sensitivity-${doc.sensitivity_level}`,
      badgeMessage: 'Clearance Locked',
    };
  }

  if (user.role === 'COURT_REGISTRAR' || user.role === 'REVIEWER') {
    return {
      allowed: false,
      reason: `Role ${user.role} is not permitted to initiate document shares`,
      badgeMessage: 'Sharing Disabled',
    };
  }

  if (user.role === 'FORENSIC_OFFICER' && doc.doc_type !== 'FORENSIC_REPORT') {
    return {
      allowed: false,
      reason: 'Forensic Officers may only share FORENSIC_REPORT documents',
      badgeMessage: 'Restricted to Lab Reports',
    };
  }

  return { allowed: true };
}

/**
 * Checks if user is eligible to approve Sensitivity-A share requests
 */
export function canApproveSensitivityA(user: User | null, caseId: string): boolean {
  if (!user) return false;
  if (!isUserAssignedToCase(user, caseId)) return false;
  return user.role === 'SUPERVISOR' || user.role === 'ADMIN';
}
