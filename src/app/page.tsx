import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight">
        Practice placement interviews with AI-scored mock sessions
      </h1>
      <p className="max-w-md text-lg text-muted-foreground">
        Record full mock interviews, get scored on content, delivery, and
        professionalism, and track your improvement over time.
      </p>
      <div className="flex gap-4">
        <Link href="/signup" className={buttonVariants()}>
          Get started
        </Link>
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>
          Log in
        </Link>
      </div>
    </div>
  );
}
