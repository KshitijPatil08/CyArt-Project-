import { SupabaseClient } from '@supabase/supabase-js';

export async function checkAndCreateAlerts(
  supabase: SupabaseClient,
  device_id: string,
  log_type: string,
  message: string,
  severity: string
) {
  try {
    const normalizedMessage = message.trim().toLowerCase();

    const alertRules = [
      {
        condition: (msg: string) => msg.includes('unauthorized') || msg.includes('failed'),
        title: 'Unauthorized Access Attempt',
        severity: 'high',
        type: 'security'
      },
      {
        condition: (msg: string) => msg.includes('unknown') && msg.includes('usb'),
        title: 'Unknown USB Device',
        severity: 'warning',
        type: 'hardware'
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

    const matchedRule = alertRules.find(rule => rule.condition(normalizedMessage));
    if (!matchedRule) return;

    const { data: existing } = await supabase
      .from('alerts')
      .select('id, created_at')
      .eq('device_id', device_id)
      .eq('alert_type', matchedRule.type)
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const lastCreated = new Date(existing[0].created_at);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastCreated > oneHourAgo) return;
    }

    await supabase.from('alerts').insert([{
      device_id,
      alert_type: matchedRule.type,
      log_type,
      message,
      severity: matchedRule.severity,
      title: matchedRule.title,
      description: `${matchedRule.title}: ${message.substring(0, 100)}`,
      resolved: false,
      created_at: new Date().toISOString(),
    }]);

    console.log(`[Alerts] Created: ${matchedRule.title}`);
  } catch (error: any) {
    console.error('[Alerts] Error:', error.message);
  }
}