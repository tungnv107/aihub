"use client";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { useText } from "./providers";
export function ActivityChart({
  data,
  bar = false,
  currency = false,
}: {
  data: { label: string; value: number }[];
  bar?: boolean;
  currency?: boolean;
}) {
  const t = useText();
  return (
    <div
      className="activity-chart"
      role="img"
      aria-label={t("Biểu đồ theo thời gian", "Activity over time")}
    >
      <ResponsiveContainer width="100%" height="100%">
        {bar ? (
          <BarChart data={data}>
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--text)",
              }}
            />
            <Bar
              dataKey="value"
              name={currency ? "VND" : t("Yêu cầu", "Requests")}
              fill="var(--primary)"
              radius={[5, 5, 0, 0]}
            />
          </BarChart>
        ) : (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#818cf8" stopOpacity={0.25} />
                <stop offset="1" stopColor="#818cf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--text)",
              }}
            />
            <Area
              dataKey="value"
              type="monotone"
              name={currency ? "VND" : t("Yêu cầu", "Requests")}
              stroke="#818cf8"
              strokeWidth={2.5}
              fill="url(#activity-fill)"
              isAnimationActive={false}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
export function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="row between">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
