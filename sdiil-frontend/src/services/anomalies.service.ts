import { supabase } from './supabase.client';

export interface AnomalyFlag {
  id: string;
  case_id?: string | null;
  user_id: string;
  rule_triggered:
    | 'BULK_DOWNLOAD'
    | 'OFF_HOURS_ACCESS'
    | 'REPEATED_SEARCH_NO_RESULT'
    | 'SENSITIVITY_A_ACCESS_SPIKE'
    | 'FAILED_ACCESS_ATTEMPT'
    | string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  metadata?: Record<string, any>;
  triggered_at: string;
  acknowledged: boolean;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  user?: {
    id: string;
    username: string;
    full_name: string;
    role: string;
  };
}

export interface AnomalyStats {
  total_unacknowledged: number;
  by_severity: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  by_rule: Record<string, number>;
}

export const anomaliesService = {
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

  async getAnomalies(): Promise<AnomalyFlag[]> {
    const token = await this.getAuthToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (!token) {
      // Fallback direct query under client session
      const { data } = await supabase
        .from('anomaly_flags')
        .select('*')
        .eq('acknowledged', false)
        .order('triggered_at', { ascending: false });
      return (data || []) as AnomalyFlag[];
    }

    try {
      const res = await fetch(`${apiBase}/anomalies`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const json = await res.json();
        return json.anomalies || [];
      }
    } catch (err) {
      console.error('[anomaliesService] Error fetching anomalies:', err);
    }

    // Fallback direct query under RLS
    const { data } = await supabase
      .from('anomaly_flags')
      .select('*')
      .eq('acknowledged', false)
      .order('triggered_at', { ascending: false });

    return (data || []) as AnomalyFlag[];
  },

  async getAnomalyStats(): Promise<AnomalyStats> {
    const token = await this.getAuthToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (token) {
      try {
        const res = await fetch(`${apiBase}/anomalies/stats`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const json = await res.json();
          return json;
        }
      } catch (err) {
        console.error('[anomaliesService] Error fetching anomaly stats:', err);
      }
    }

    return {
      total_unacknowledged: 0,
      by_severity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      by_rule: {},
    };
  },

  async acknowledgeAnomaly(id: string): Promise<boolean> {
    const token = await this.getAuthToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (!token) return false;

    try {
      const res = await fetch(`${apiBase}/anomalies/${id}/acknowledge`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return res.ok;
    } catch (err) {
      console.error('[anomaliesService] Acknowledge error:', err);
      return false;
    }
  },

  async triggerDemoAnomalies(): Promise<boolean> {
    const token = await this.getAuthToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

    if (!token) return false;

    try {
      const res = await fetch(`${apiBase}/anomalies/demo-trigger`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return res.ok;
    } catch (err) {
      console.error('[anomaliesService] Demo trigger error:', err);
      return false;
    }
  },
};
