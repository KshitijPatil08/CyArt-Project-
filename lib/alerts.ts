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
        condition: (msg: string) => msg.includes('unauthorized') || msg.includes('failed') || msg.includes('access denied'),
        title: 'Unauthorized Access Attempt',
        severity: 'critical',
        type: 'security'
      },
      {
        condition: (msg: string) => msg.includes('security breach') || msg.includes('intrusion'),
        title: 'Security Breach Detected',
        severity: 'critical',
        type: 'security'
      },
      {
        condition: (msg: string) => msg.includes('malware') || msg.includes('virus') || msg.includes('threat'),
        title: 'Malware Detection',
        severity: 'critical',
        type: 'security'
      },
      {
        condition: (msg: string) => msg.includes('failed login') || msg.includes('authentication failed'),
        title: 'Failed Authentication',
        severity: 'high',
        type: 'security'
      },
      // Driver Alerts
      {
        condition: (msg: string) => msg.includes('driver') && (msg.includes('failed') || msg.includes('error') || msg.includes('incompatible')),
        title: 'Driver Issue Detected',
        severity: 'high',
        type: 'driver'
      },
      // Server Alerts
      {
        condition: (msg: string) => msg.includes('server') && (msg.includes('stopped') || msg.includes('shutdown') || msg.includes('offline') || msg.includes('error')),
        title: 'Server Critical Event',
        severity: 'critical',
        type: 'server'
      },
      // USB Alerts (General/Unknown)
      {
        condition: (msg: string) => msg.includes('unknown') && msg.includes('usb'),
        title: 'Unknown USB Device',
        severity: 'moderate',
        type: 'hardware'
      },
      {
        condition: (msg: string) => {
          const hour = new Date().getHours();
          return (hour < 6 || hour > 22) && msg.includes('usb') && msg.includes('connected');
        },
        title: 'Off-Hours USB Activity',
        severity: 'moderate',
        type: 'hardware'
      },
      // Other Device Alerts
      {
        condition: (msg: string) => !msg.includes('usb') && (msg.includes('connected') || msg.includes('disconnected')) && (msg.includes('device') || msg.includes('hardware')),
        title: 'Peripheral Device Event',
        severity: 'info',
        type: 'other_device'
      },
      {
        condition: (msg: string) => msg.includes('error') && (msg.includes('system') || msg.includes('critical')),
        title: 'System Error',
        severity: 'high',
        type: 'system'
      },
      {
        condition: (msg: string) => msg.includes('warning') && msg.includes('security'),
        title: 'Security Warning',
        severity: 'moderate',
        type: 'security'
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
      severity: matchedRule.severity,
      title: matchedRule.title,
      description: `${matchedRule.title}: ${message.substring(0, 200)}`,
      is_read: false,
      is_resolved: false,
      created_at: new Date().toISOString(),
    }]);

    console.log(`[Alerts] Created: ${matchedRule.title}`);
  } catch (error: any) {
    console.error('[Alerts] Error:', error.message);
  }
}