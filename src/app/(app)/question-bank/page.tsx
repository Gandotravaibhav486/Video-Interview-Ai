import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuestionBankManager } from "@/components/question-bank/question-bank-manager";

export default async function QuestionBankPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user!.id)
    .single();

  if (!profile?.is_admin) {
    redirect("/dashboard");
  }

  const { data: questions } = await supabase
    .from("question_bank")
    .select("*")
    .order("subject", { ascending: true })
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Question bank</h1>
        <p className="text-muted-foreground">
          Manage the curated questions and reference answers students draw
          from when starting a mock interview.
        </p>
      </div>
      <QuestionBankManager questions={questions ?? []} />
    </div>
  );
}
