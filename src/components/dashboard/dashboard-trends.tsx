"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InterviewSession } from "@/lib/supabase/types";

const LINE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed"];

export function ScoreTrendChart({ sessions }: { sessions: InterviewSession[] }) {
  const parameterKeys = Array.from(
    new Set(sessions.flatMap((s) => Object.keys(s.score_breakdown)))
  );

  const data = sessions.map((s, i) => {
    const row: Record<string, number | string> = {
      label: s.completed_at
        ? new Date(s.completed_at).toLocaleDateString()
        : `#${i + 1}`,
      overall: s.overall_score ?? 0,
    };
    for (const key of parameterKeys) {
      row[key] = s.score_breakdown[key]?.score ?? 0;
    }
    return row;
  });

  const labels = Object.fromEntries(
    sessions.flatMap((s) =>
      Object.entries(s.score_breakdown).map(([k, v]) => [k, v.label])
    )
  );

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 100]} />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="overall"
          name="Overall"
          stroke="#111827"
          strokeWidth={2}
        />
        {parameterKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={labels[key] ?? key}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
