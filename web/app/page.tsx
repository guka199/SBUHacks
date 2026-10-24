import Link from "next/link";

export default function Home() {
  return (
    <section className="flex flex-col gap-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Know how a post will do before you publish it.</h1>
      <p className="max-w-2xl text-lg opacity-70">
        PostPilot compares your engagement across YouTube, TikTok, Instagram and LinkedIn, predicts how a draft
        will perform on each platform, and tells you exactly what to change.
      </p>
      <div className="flex gap-3">
        <Link href="/score" className="rounded-md bg-foreground px-4 py-2 text-background">
          Score a post
        </Link>
        <Link href="/dashboard" className="rounded-md border border-black/15 px-4 py-2 dark:border-white/15">
          View dashboard
        </Link>
      </div>
    </section>
  );
}
