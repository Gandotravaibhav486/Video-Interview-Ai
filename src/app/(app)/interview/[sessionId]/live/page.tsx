import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveInterviewFlow } from "@/components/interview/live-interview-flow";

export default async function LiveInterviewPage({
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
  if (session.mode !== "live") redirect(`/interview/${sessionId}/record`);
  if (session.status === "completed" || session.status === "failed") {
    redirect(`/interview/${sessionId}/results`);
  }
  if (session.status === "processing") {
    redirect(`/interview/${sessionId}/processing`);
  }

  // startLiveInterview() always inserts the opening turn before redirecting
  // here, so there should always be exactly one turn at this point - but
  // guard rather than assume, since a hard refresh mid-flow re-runs this.
  const { data: turns } = await supabase
    .from("live_turns")
    .select("*")
    .eq("session_id", sessionId)
    .order("turn_index", { ascending: true });

  if (!turns || turns.length === 0) redirect("/dashboard");

  const lastTurn = turns[turns.length - 1];

  return (
    <LiveInterviewFlow
      sessionId={sessionId}
      userId={user!.id}
      initialUtterance={lastTurn.speaker === "agent" ? lastTurn.text : null}
      initialTurnCounter={turns.length}
    />
  );
}
