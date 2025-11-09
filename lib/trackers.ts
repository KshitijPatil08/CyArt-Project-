// lib/trackers.ts
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tracks data transfer events (like USB transfers) in Supabase.
 */
export async function trackDataTransfer(
  supabase: SupabaseClient,
  device_id: string,
  message: string,
  raw_data: any
) {
  try {
    // Extract or normalize relevant details
    const transferType = message.toLowerCase().includes('usb') ? 'usb' : 'unknown';
    const timestamp = new Date().toISOString();

    // Optional: Parse or summarize data payload
    const dataSummary = typeof raw_data === 'object'
      ? JSON.stringify(raw_data).slice(0, 200)
      : String(raw_data).slice(0, 200);

    // Insert record
    const { error } = await supabase.from('data_transfers').insert([
      {
        device_id,
        transfer_type: transferType,
        message,
        data_summary: dataSummary,
        created_at: timestamp,
      },
    ]);

    if (error) throw error;

    console.log(`[Tracker] Data transfer logged for ${device_id}: ${transferType}`);
  } catch (error: any) {
    console.error('[Tracker] Error logging data transfer:', error.message || error);
  }
}
