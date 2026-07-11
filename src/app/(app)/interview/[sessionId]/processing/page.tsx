import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProcessingStatus } from "@/components/interview/processing-status";

export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("interview_sessions")
    .select("status")
    .eq("id", sessionId)
    .single();

  if (!session) redirect("/dashboard");
  if (session.status === "completed" || session.status === "failed") {
    redirect(`/interview/${sessionId}/results`);
  }

  return <ProcessingStatus sessionId={sessionId} />;
}
