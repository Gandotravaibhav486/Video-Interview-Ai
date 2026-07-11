import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecordingFlow } from "@/components/interview/recording-flow";

export default async function RecordPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: session } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) redirect("/dashboard");
  if (session.status === "completed" || session.status === "failed") {
    redirect(`/interview/${sessionId}/results`);
  }
  if (session.status === "processing") {
    redirect(`/interview/${sessionId}/processing`);
  }

  const { data: questions } = await supabase
    .from("session_questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  if (!questions || questions.length === 0) redirect("/dashboard");

  return (
    <RecordingFlow
      sessionId={sessionId}
      questions={questions}
      userId={user!.id}
    />
  );
}
