// lib/alerts.ts
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Checks whether an alert already exists for a given device and message,
 * and creates one if it doesn't exist or is old enough.
 */
export async function checkAndCreateAlerts(
  supabase: SupabaseClient,
  device_id: string,
  log_type: string,
  message: string,
  severity: string
) {
  try {
    // Normalize message to detect duplicates more easily
    const normalizedMessage = message.trim().toLowerCase();

    // Define alert rules based on log content
    const alertRules = [
      {
        condition: (msg: string) => msg.includes('unauthorized') || msg.includes('failed login'),
        title: 'Unauthorized Access Attempt',
        severity: 'high',
        type: 'security'
      },
      {
        condition: (msg: string) => msg.includes('unknown') && msg.includes('usb'),
        title: 'Unknown USB Device Detected',
        severity: 'warning',
        type: 'hardware'
      },
      {
        condition: (msg: string) => msg.includes('critical') || msg.includes('system file'),
        title: 'Critical System Change',
        severity: 'critical',
        type: 'file_integrity'
      },
      {
        condition: (msg: string) => {
          const hour = new Date().getHours();
          return (hour < 6 || hour > 22) && msg.includes('usb') && msg.includes('connected');
        },
        title: 'Off-Hours USB Activity',
        severity: 'warning',
        type: 'hardware'
      }
    ];

    // Check if any rule matches
    const matchedRule = alertRules.find(rule => rule.condition(normalizedMessage));

    if (!matchedRule) {
      // No special alert needed for this message
      return;
    }

    // Check if a similar alert already exists (to avoid flooding)
    const { data: existing, error: fetchError } = await supabase
      .from('alerts')
      .select('id, created_at')
      .eq('device_id', device_id)
      .eq('alert_type', matchedRule.type)
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('[Alerts] Error fetching existing alerts:', fetchError);
      throw fetchError;
    }

    // Skip if similar unresolved alert exists in the last hour
    if (existing && existing.length > 0) {
      const lastCreated = new Date(existing[0].created_at);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastCreated > oneHourAgo) {
        console.log(`[Alerts] Skipped duplicate alert for device ${device_id}`);
        return;
      }
    }

    // Insert new alert
    const { error: insertError } = await supabase
      .from('alerts')
      .insert([
        {
          device_id,
          alert_type: matchedRule.type,
          log_type,
          message,
          severity: matchedRule.severity,
          title: matchedRule.title,
          description: `${matchedRule.title}: ${message.substring(0, 100)}`,
          resolved: false,
          created_at: new Date().toISOString(),
        },
      ]);

    if (insertError) {
      console.error('[Alerts] Error inserting alert:', insertError);
      throw insertError;
    }

    console.log(`[Alerts] New ${matchedRule.severity} alert created for device ${device_id}: ${matchedRule.title}`);
  } catch (error: any) {
    console.error('[Alerts] Error handling alert:', error.message || error);
  }
}

/**
 * Mark an alert as resolved
 */
export async function resolveAlert(
  supabase: SupabaseClient,
  alert_id: string,
  resolved_by?: string
) {
  try {
    const { error } = await supabase
      .from('alerts')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: resolved_by || 'system'
      })
      .eq('id', alert_id);

    if (error) throw error;

    console.log(`[Alerts] Alert ${alert_id} marked as resolved`);
    return { success: true };
  } catch (error: any) {
    console.error('[Alerts] Error resolving alert:', error.message || error);
    return { success: false, error: error.message };
  }
}

/**
 * Get active alerts for a device
 */
export async function getActiveAlerts(
  supabase: SupabaseClient,
  device_id?: string,
  limit: number = 50
) {
  try {
    let query = supabase
      .from('alerts')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (device_id) {
      query = query.eq('device_id', device_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, alerts: data };
  } catch (error: any) {
    console.error('[Alerts] Error fetching alerts:', error.message || error);
    return { success: false, error: error.message, alerts: [] };
  }
}
