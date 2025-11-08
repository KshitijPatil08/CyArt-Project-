"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

interface DeviceEvent {
  id: string;
  device_name: string;
  device_category: string; // USB | MOUSE | PRINTER | KEYBOARD | CHARGER
  event: string; // connected | disconnected
  timestamp: string;
  host_name: string;
}

export default function RealTimeAlerts() {
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const supabase = createClient();
  const { toast } = useToast();

  useEffect(() => {
    async function loadInitial() {
      const { data } = await supabase
        .from("device_events")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(20);
      setEvents(data ?? []);
    }

    loadInitial();

    // Realtime listener
    const channel = supabase
      .channel("device-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "device_events" },
        (payload) => {
          const newEvent = payload.new as DeviceEvent;
          setEvents((prev) => [newEvent, ...prev].slice(0, 20));

          // Show one-line toast
          toast({
            title: `${newEvent.device_category} ${newEvent.event}`,
            duration: 3000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "USB":
        return "bg-blue-500";
      case "CHARGER":
        return "bg-yellow-500";
      case "MOUSE":
        return "bg-green-500";
      case "KEYBOARD":
        return "bg-purple-500";
      case "PRINTER":
        return "bg-pink-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <Card className="p-4">
      <h2 className="text-lg font-semibold mb-3">Live Alerts</h2>
      <div className="space-y-2 overflow-y-auto max-h-[400px]">
        {events.map((e) => (
          <div
            key={e.id}
            className="flex justify-between items-center border-b py-2"
          >
            <div>
              <p className="font-medium">
                {e.device_category} {e.event}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(e.timestamp).toLocaleString()}
              </p>
            </div>
            <Badge className={categoryColor(e.device_category)}>
              {e.device_category}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}