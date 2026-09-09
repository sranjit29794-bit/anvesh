import { supabase } from './supabase.client';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  department: string;
  account_status: 'ACTIVE' | 'LOCKED';
  case_count: number;
  created_at: string;
  last_sign_in_at?: string | null;
}

export interface AdminCaseAssignment {
  id: string;
  case_id: string;
  user_id: string;
  role_in_case: string;
  assigned_at: string;
  profiles?: {
    id: string;
    name: string;
    role: string;
    department?: string;
  };
}

export interface AdminCase {
  id: string;
  case_id: string;
  case_number: string;
  title: string;
  description?: string;
  department?: string;
  status: string;
  document_count: number;
  assigned_user_count: number;
  assigned_users?: AdminCaseAssignment[];
  created_at: string;
}

export interface SystemStats {
  total_users: number;
  total_cases: number;
  total_documents: number;
  total_audit_events: number;
  unacknowledged_anomalies: number;
  active_shares: number;
  pending_approvals: number;
}

export const adminService = {
  async getAuthToken(): Promise<string | null> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  },

  getApiBase(): string {
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
  },

  async getUsers(): Promise<AdminUser[]> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/users`, {
      headers: {
        Authorization: `Bearer ${token || ''}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch users' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.users || [];
  },

  async createUser(payload: {
    email: string;
    full_name: string;
    role: string;
    department?: string;
  }): Promise<{ user: AdminUser; temp_password: string }> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create user');
    }

    return { user: data.user, temp_password: data.temp_password };
  },

  async updateUserRole(userId: string, role: string): Promise<void> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify({ role }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update user role');
    }
  },

  async lockUser(userId: string): Promise<void> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/users/${userId}/lock`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token || ''}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to lock user');
    }
  },

  async unlockUser(userId: string): Promise<void> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/users/${userId}/unlock`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token || ''}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to unlock user');
    }
  },

  async resetUserMFA(userId: string): Promise<void> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/users/${userId}/reset-mfa`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token || ''}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to reset user MFA');
    }
  },

  async getCases(): Promise<AdminCase[]> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/cases`, {
      headers: {
        Authorization: `Bearer ${token || ''}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch cases' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.cases || [];
  },

  async createCase(payload: {
    case_id: string;
    title: string;
    description?: string;
    department?: string;
    status?: string;
  }): Promise<AdminCase> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/cases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create case');
    }

    return data.case;
  },

  async assignUserToCase(caseId: string, userId: string, role_in_case?: string): Promise<void> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/cases/${caseId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify({ userId, role_in_case: role_in_case || 'INVESTIGATOR' }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to assign user to case');
    }
  },

  async removeUserFromCase(caseId: string, userId: string): Promise<void> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/cases/${caseId}/assign/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token || ''}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to remove user from case');
    }
  },

  async getSystemStats(): Promise<SystemStats> {
    const token = await this.getAuthToken();
    const res = await fetch(`${this.getApiBase()}/admin/stats`, {
      headers: {
        Authorization: `Bearer ${token || ''}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch stats' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return (
      data.stats || {
        total_users: 0,
        total_cases: 0,
        total_documents: 0,
        total_audit_events: 0,
        unacknowledged_anomalies: 0,
        active_shares: 0,
        pending_approvals: 0,
      }
    );
  },
};
