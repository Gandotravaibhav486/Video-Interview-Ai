"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScoreBreakdown, SubjectBreakdown } from "@/lib/supabase/types";

export function DeliveryBreakdownChart({
  scoreBreakdown,
}: {
  scoreBreakdown: ScoreBreakdown;
}) {
  const data = Object.entries(scoreBreakdown).map(([key, param]) => ({
    name: param.label,
    score: param.score,
    key,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} />
        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="score" fill="var(--color-primary, #2563eb)" radius={4} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SubjectBreakdownChart({
  subjectBreakdown,
}: {
  subjectBreakdown: SubjectBreakdown;
}) {
  const data = Object.entries(subjectBreakdown).map(([subject, score]) => ({
    subject,
    score,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="subject" tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 100]} />
        <Tooltip />
        <Bar dataKey="score" fill="var(--color-secondary, #16a34a)" radius={4} />
      </BarChart>
    </ResponsiveContainer>
  );
}
