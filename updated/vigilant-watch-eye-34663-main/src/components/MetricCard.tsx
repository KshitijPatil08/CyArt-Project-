import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";

interface MetricCardProps {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: LucideIcon;
  color: "primary" | "success" | "warning" | "critical" | "info";
}

export const MetricCard = ({ title, value, change, trend, icon: Icon, color }: MetricCardProps) => {
  const colorClasses = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    critical: "text-critical",
    info: "text-info",
  };

  const bgClasses = {
    primary: "bg-primary/10",
    success: "bg-success/10",
    warning: "bg-warning/10",
    critical: "bg-critical/10",
    info: "bg-info/10",
  };

  return (
    <Card className="p-6 card-shadow border-border hover:border-primary/50 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <h3 className="text-3xl font-bold tracking-tight">{value}</h3>
          <div className="flex items-center gap-1 mt-2">
            {trend === "up" ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-critical" />
            )}
            <span className={`text-sm ${trend === "up" ? "text-success" : "text-critical"}`}>
              {change}
            </span>
          </div>
        </div>
        <div className={`p-3 rounded-lg ${bgClasses[color]}`}>
          <Icon className={`h-6 w-6 ${colorClasses[color]}`} />
        </div>
      </div>
    </Card>
  );
};
