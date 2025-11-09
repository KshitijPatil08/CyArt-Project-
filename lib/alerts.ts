// lib/alerts.ts
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Checks whether an alert already exists for a given device and message,
 * and creates one if it doesn’t.
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

    // Check if a similar alert already exists (to avoid flooding)
    const { data: existing, error: fetchError } = await supabase
      .from('alerts')
      .select('id, created_at')
      .eq('device_id', device_id)
      .eq('log_type', log_type)
      .ilike('message', `%${normalizedMessage}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    // Optional: skip creating alert if a similar one exists in the last hour
    if (existing && existing.length > 0) {
      const lastCreated = new Date(existing[0].created_at);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastCreated > oneHourAgo) {
        console.log(`[Alerts] Skipped duplicate alert for device ${device_id}`);
        return;
      }
    }

    // Insert new alert
    const { error: insertError } = await supabase.from('alerts').insert([
      {
        device_id,
        log_type,
        message,
        severity,
        resolved: false,
        created_at: new Date().toISOString(),
      },
    ]);

    if (insertError) throw insertError;

    console.log(`[Alerts] New alert created for device ${device_id}: ${message}`);
  } catch (error: any) {
    console.error('[Alerts] Error handling alert:', error.message || error);
  }
}
