"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ShieldAlert, Check } from "lucide-react";

interface Alert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  created_at: string;
  is_resolved: boolean;
}

export default function RealTimeAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const supabase = createClient();
  const { toast } = useToast();

  useEffect(() => {
    async function loadInitial() {
      const { data } = await supabase
        .from("alerts")
        .select("*")
        .eq("severity", "critical") // Only show critical alerts as requested
        .eq("is_resolved", false)
        .order("created_at", { ascending: false })
        .limit(20);
      setAlerts(data ?? []);
    }

    loadInitial();

    // Realtime listener for alerts
    const channel = supabase
      .channel("realtime-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts", filter: "severity=eq.critical" },
        (payload: any) => {
          const newAlert = payload.new as Alert;
          setAlerts((prev: Alert[]) => [newAlert, ...prev].slice(0, 20));

          // Show toast
          toast({
            title: "CRITICAL ALERT",
            description: newAlert.title,
            variant: "destructive",
            duration: 5000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleResolve = async (id: string) => {
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ is_resolved: true })
        .eq('id', id);

      if (error) throw error;

      setAlerts(prev => prev.filter(a => a.id !== id));
      toast({
        title: "Alert Resolved",
        description: "The alert has been marked as resolved.",
      });
    } catch (error) {
      console.error('Error resolving alert:', error);
      toast({
        title: "Error",
        description: "Failed to resolve alert.",
        variant: "destructive",
      });
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-600 hover:bg-red-700";
      case "high":
        return "bg-orange-500 hover:bg-orange-600";
      case "moderate":
        return "bg-yellow-500 hover:bg-yellow-600";
      default:
        return "bg-blue-500 hover:bg-blue-600";
    }
  };

  return (
    <Card className="p-4 border-red-200 bg-red-50/10">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="w-5 h-5 text-red-600" />
        <h2 className="text-lg font-semibold text-red-900 dark:text-red-100">Live Critical Alerts</h2>
      </div>

      <div className="space-y-2 overflow-y-auto max-h-[400px]">
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No critical alerts</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex flex-col gap-1 border-b border-red-100 dark:border-red-900/30 py-3 last:border-0"
            >
              <div className="flex justify-between items-start">
                <p className="font-semibold text-red-700 dark:text-red-400 text-sm">
                  {alert.title}
                </p>
                <div className="flex items-center gap-2">
                  <Badge className={`${severityColor(alert.severity)} text-white border-0`}>
                    {alert.severity.toUpperCase()}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-700 hover:text-red-900 hover:bg-red-100 dark:hover:bg-red-900/20"
                    onClick={() => handleResolve(alert.id)}
                    title="Mark as Resolved"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {alert.description}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                {new Date(alert.created_at).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}