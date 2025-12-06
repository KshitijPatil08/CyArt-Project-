import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Fetch all devices
    const { data: { user } } = await supabase.auth.getUser();

    let query = supabase
      .from('devices')
      .select('*')
      .order('last_seen', { ascending: false });

    // RBAC: If not admin, show devices owned by user OR devices marked as server (for status check)
    if (user?.user_metadata?.role !== 'admin' && user?.email) {
      query = query.or(`owner.eq.${user.email},is_server.eq.true`);
    }

    const { data: devices, error } = await query;
    if (error) throw error;

    // 2. Check for offline devices (threshold: 1 minute)
    const now = new Date();
    const offlineThreshold = 1 * 60 * 1000; // 1 minute in milliseconds

    const updatedDevices = devices?.map(device => {
      const lastSeen = new Date(device.last_seen).getTime();
      const isOffline = (now.getTime() - lastSeen) > offlineThreshold;

      // If device is technically offline but marked online, we should update it
      // However, for performance, we might just return the calculated status
      // But to be persistent, let's update if needed. 
      // For this specific request "don't make this manual it should check for server status",
      // returning the calculated status is faster and doesn't require writing to DB on every read.
      // But if we want other components to see it, we should probably update.
      // Let's just return the calculated status for the UI to be snappy.

      if (isOffline && device.status === 'online') {
        return { ...device, status: 'offline' };
      }
      return device;
    });

    // Optional: Background update for persistence (fire and forget)
    // We filter for devices that need updating to avoid unnecessary DB calls
    const devicesToUpdate = updatedDevices?.filter(d =>
      d.status === 'offline' && devices.find(old => old.id === d.id)?.status === 'online'
    );

    if (devicesToUpdate && devicesToUpdate.length > 0) {
      // We don't await this to keep the response fast
      const idsToUpdate = devicesToUpdate.map(d => d.id);
      supabase
        .from('devices')
        .update({ status: 'offline' })
        .in('id', idsToUpdate)
        .then(({ error }) => {
          if (error) console.error("Error auto-updating offline status:", error);
        });
    }

    return NextResponse.json({
      success: true,
      count: updatedDevices?.length || 0,
      devices: updatedDevices || []
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}