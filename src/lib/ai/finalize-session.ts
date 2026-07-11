import { createServiceRoleClient } from "@/lib/supabase/server";
import { weightedOverallScore } from "@/lib/scoring/weights";
import { summarizeSession } from "@/lib/ai/scoring";
import type { ScoreBreakdown, SubjectBreakdown } from "@/lib/supabase/types";

export async function maybeFinalizeSession(sessionId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: session } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session || session.status === "completed" || session.status === "failed") {
    return;
  }

  const { data: questions } = await supabase
    .from("session_questions")
    .select("*")
    .eq("session_id", sessionId);
  if (!questions || questions.length === 0) return;

  const { data: answers } = await supabase
    .from("answers")
    .select("*")
    .in(
      "question_id",
      questions.map((q) => q.id)
    );
  if (!answers || answers.length < questions.length) return;

  if (answers.some((a) => a.feedback_status === "failed")) {
    await supabase
      .from("interview_sessions")
      .update({ status: "failed" })
      .eq("id", sessionId);
    return;
  }

  if (!answers.every((a) => a.feedback_status === "complete")) return;

  const paramTotals: Record<
    string,
    { sum: number; weight: number; label: string; count: number }
  > = {};
  for (const a of answers) {
    for (const [key, param] of Object.entries(a.answer_score_breakdown)) {
      const t = paramTotals[key] ?? {
        sum: 0,
        weight: param.weight,
        label: param.label,
        count: 0,
      };
      t.sum += param.score;
      t.count += 1;
      paramTotals[key] = t;
    }
  }
  const scoreBreakdown: ScoreBreakdown = {};
  for (const [key, t] of Object.entries(paramTotals)) {
    scoreBreakdown[key] = {
      score: Math.round(t.sum / t.count),
      weight: t.weight,
      label: t.label,
    };
  }
  const overallScore = weightedOverallScore(
    Object.fromEntries(Object.entries(scoreBreakdown).map(([k, v]) => [k, v.score]))
  );

  const subjectTotals: Record<string, { sum: number; count: number }> = {};
  for (const q of questions) {
    const answer = answers.find((a) => a.question_id === q.id);
    if (!answer) continue;
    const answerScores = Object.fromEntries(
      Object.entries(answer.answer_score_breakdown).map(([k, v]) => [k, v.score])
    );
    const answerOverall = weightedOverallScore(answerScores);
    const t = subjectTotals[q.subject] ?? { sum: 0, count: 0 };
    t.sum += answerOverall;
    t.count += 1;
    subjectTotals[q.subject] = t;
  }
  const subjectBreakdown: SubjectBreakdown = {};
  for (const [subject, t] of Object.entries(subjectTotals)) {
    subjectBreakdown[subject] = Math.round(t.sum / t.count);
  }

  const summaryFeedback = await summarizeSession(
    questions.map((q) => ({
      questionText: q.question_text,
      subject: q.subject,
      feedback: answers.find((a) => a.question_id === q.id)?.answer_feedback ?? "",
    }))
  );

  await supabase
    .from("interview_sessions")
    .update({
      overall_score: overallScore,
      score_breakdown: scoreBreakdown,
      subject_breakdown: subjectBreakdown,
      summary_feedback: summaryFeedback,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}
