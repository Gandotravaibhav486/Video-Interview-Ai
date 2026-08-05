import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("interview_sessions")
    .select("status, mode, updated_at")
    .eq("id", sessionId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // updatedAt lets the client detect a session stuck on "processing" - this
  // column only changes when status itself changes (nothing else touches
  // interview_sessions while scoring runs), so "processing" plus a stale
  // updated_at means the background job died rather than that it's still
  // working.
  return NextResponse.json({
    status: data.status,
    mode: data.mode,
    updatedAt: data.updated_at,
  });
}
