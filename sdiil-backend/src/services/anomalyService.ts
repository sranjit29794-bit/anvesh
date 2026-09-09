import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export interface AnomalyEvaluationParams {
  userId: string;
  action: string;
  caseId?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Anomaly Detection Service (Phase 10)
 * Evaluates 5 statutory integrity and exfiltration rules on audit_log events.
 * Executes asynchronously without blocking core request paths.
 */
class AnomalyService {
  /**
   * Helper to resolve case identifier (UUID or case_number) to consistent identifier.
   */
  private async resolveCaseId(caseId?: string | null): Promise<string | null> {
    if (!caseId) return null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
    if (isUuid) return caseId;

    const { data: caseRow } = await supabaseAdmin
      .from('cases')
      .select('id, case_number')
      .or(`case_number.eq.${caseId},id.eq.${caseId}`)
      .maybeSingle();

    return caseRow?.id || caseId;
  }

  /**
   * Inserts an anomaly flag into anomaly_flags table using supabaseAdmin.
   * Debounces identical unacknowledged flags within a 15-second window.
   */
  private async flagAnomaly(
    ruleTriggered: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    description: string,
    userId: string,
    caseId?: string | null,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      // Debounce check: Avoid spamming identical flags within 15 seconds
      const fifteenSecondsAgo = new Date(Date.now() - 15 * 1000).toISOString();
      let query = supabaseAdmin
        .from('anomaly_flags')
        .select('id')
        .eq('rule_triggered', ruleTriggered)
        .eq('user_id', userId)
        .eq('acknowledged', false)
        .gte('triggered_at', fifteenSecondsAgo);

      if (caseId) {
        query = query.eq('case_id', caseId);
      }

      const { data: existing } = await query.limit(1);
      if (existing && existing.length > 0) {
        return; // Already flagged recently
      }

      const { error } = await supabaseAdmin.from('anomaly_flags').insert({
        case_id: caseId || null,
        user_id: userId,
        rule_triggered: ruleTriggered,
        severity,
        description,
        metadata,
        triggered_at: new Date().toISOString(),
        acknowledged: false,
      });

      if (error) {
        console.error(`[AnomalyService] Failed to insert flag for ${ruleTriggered}:`, error.message);
      } else {
        console.log(`[AnomalyService] Flagged anomaly: ${ruleTriggered} [${severity}] for user ${userId}`);
      }
    } catch (err: any) {
      console.error(`[AnomalyService] Error flagging anomaly ${ruleTriggered}:`, err?.message);
    }
  }

  /**
   * Main evaluation entrypoint called non-blocking after every audit_log write.
   */
  public async evaluateAnomalies(
    userId: string,
    action: string,
    caseId?: string | null,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!userId) return;

    try {
      const resolvedCaseId = await this.resolveCaseId(caseId);

      // ----------------------------------------------------------------------
      // Rule 1: BULK_DOWNLOAD
      // Triggered when the same user_id performs > 5 download actions within 10 minutes on the same case_id.
      // ----------------------------------------------------------------------
      if (action === 'download' && resolvedCaseId) {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { count, error: countErr } = await supabaseAdmin
          .from('audit_log')
          .select('id', { count: 'exact' })
          .eq('user_id', userId)
          .eq('action', 'download')
          .eq('case_id', resolvedCaseId)
          .gte('created_at', tenMinutesAgo)
          .limit(1);

        if (!countErr && typeof count === 'number' && count > 5) {
          await this.flagAnomaly(
            'BULK_DOWNLOAD',
            'HIGH',
            `User downloaded more than 5 documents within 10 minutes on case ${caseId || resolvedCaseId}`,
            userId,
            resolvedCaseId,
            { action, download_count: count, case_id: resolvedCaseId }
          );
        }
      }

      // ----------------------------------------------------------------------
      // Rule 2: OFF_HOURS_ACCESS
      // Triggered when any document access or download action occurs between 23:00 and 05:00 IST (UTC+5:30).
      // ----------------------------------------------------------------------
      if (['download', 'view', 'document_access'].includes(action)) {
        const now = new Date();
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(now.getTime() + istOffsetMs);
        const istHour = istTime.getUTCHours();

        if (istHour >= 23 || istHour < 5) {
          await this.flagAnomaly(
            'OFF_HOURS_ACCESS',
            'MEDIUM',
            `Document accessed outside permitted hours by user ${userId} on case ${caseId || resolvedCaseId || 'unspecified'}`,
            userId,
            resolvedCaseId,
            { action, ist_hour: istHour, timestamp: now.toISOString() }
          );
        }
      }

      // ----------------------------------------------------------------------
      // Rule 3: REPEATED_SEARCH_NO_RESULT
      // Triggered when user runs >= 3 searches in any 5-minute window on a case_id and all return 0 chunks.
      // ----------------------------------------------------------------------
      if (action === 'search' && resolvedCaseId) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: searchRows, error: searchErr } = await supabaseAdmin
          .from('audit_log')
          .select('id, metadata')
          .eq('user_id', userId)
          .eq('action', 'search')
          .eq('case_id', resolvedCaseId)
          .gte('created_at', fiveMinutesAgo);

        if (!searchErr && searchRows) {
          const zeroResultCount = searchRows.filter((row: any) => {
            const m = row.metadata;
            if (!m) return false;
            return (
              String(m.chunks_returned) === '0' ||
              String(m.chunks_retrieved) === '0' ||
              String(m.chunks_used_count) === '0'
            );
          }).length;

          if (zeroResultCount >= 3) {
            await this.flagAnomaly(
              'REPEATED_SEARCH_NO_RESULT',
              'LOW',
              `User repeatedly searched with zero results, possible unauthorized case probing on case ${caseId || resolvedCaseId}`,
              userId,
              resolvedCaseId,
              { zero_result_searches: zeroResultCount, case_id: resolvedCaseId }
            );
          }
        }
      }

      // ----------------------------------------------------------------------
      // Rule 4: SENSITIVITY_A_ACCESS_SPIKE
      // Triggered when > 3 Sensitivity-A documents are accessed by the same user within 15 minutes.
      // ----------------------------------------------------------------------
      if (['download', 'view', 'document_access'].includes(action)) {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: accessRows, error: accessErr } = await supabaseAdmin
          .from('audit_log')
          .select('id, metadata')
          .eq('user_id', userId)
          .in('action', ['download', 'view', 'document_access'])
          .gte('created_at', fifteenMinutesAgo);

        if (!accessErr && accessRows) {
          const sensACount = accessRows.filter((row: any) => {
            const level = row.metadata?.sensitivity_level;
            return level === 'A' || level === 'sensitivity_a';
          }).length;

          if (sensACount > 3) {
            await this.flagAnomaly(
              'SENSITIVITY_A_ACCESS_SPIKE',
              'CRITICAL',
              `Unusual spike in Sensitivity-A document access by user ${userId}`,
              userId,
              resolvedCaseId,
              { sensitivity_a_accesses: sensACount }
            );
          }
        }
      }

      // ----------------------------------------------------------------------
      // Rule 5: FAILED_ACCESS_ATTEMPT
      // Triggered when user receives >= 3 403 responses ('access_denied') within 5 minutes.
      // ----------------------------------------------------------------------
      if (action === 'access_denied') {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count: deniedCount, error: deniedErr } = await supabaseAdmin
          .from('audit_log')
          .select('id', { count: 'exact' })
          .eq('user_id', userId)
          .eq('action', 'access_denied')
          .gte('created_at', fiveMinutesAgo)
          .limit(1);

        if (!deniedErr && typeof deniedCount === 'number' && deniedCount >= 3) {
          await this.flagAnomaly(
            'FAILED_ACCESS_ATTEMPT',
            'HIGH',
            `Repeated unauthorized access attempts by user ${userId}`,
            userId,
            resolvedCaseId,
            { failed_attempts: deniedCount }
          );
        }
      }
    } catch (err: any) {
      console.error('[AnomalyService] Error evaluating anomalies:', err?.message);
    }
  }
}

export const anomalyService = new AnomalyService();
