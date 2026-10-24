"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/score", label: "Score a post" },
  { href: "/accounts", label: "Accounts" },
  { href: "/rewards", label: "Rewards" },
];

export function Nav() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold">
          PostPilot
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm opacity-70 hover:opacity-100">
            {l.label}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {loading ? null : user ? (
            <>
              <Link href="/settings" className="opacity-70 hover:opacity-100" title="Settings">
                {user.display_name}
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  router.push("/");
                }}
                className="rounded-md border px-3 py-1"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="opacity-70 hover:opacity-100">
                Sign in
              </Link>
              <Link href="/signup" className="rounded-md bg-foreground px-3 py-1 text-background">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
