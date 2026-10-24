"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { auth } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const input = "rounded-md border px-3 py-2";

/** Shared sign-up / sign-in form. After success it goes to /accounts (new users) or /score. */
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const { setUser } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<"creator" | "business">("creator");
  const [niche, setNiche] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === "signup"
          ? await auth.signup({ email, password, display_name: name, account_type: accountType, niche: niche || undefined })
          : await auth.login(email, password);
      setUser(user);
      router.push(mode === "signup" ? "/accounts" : "/score");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6 py-8">
      <h1 className="text-2xl font-semibold">{mode === "signup" ? "Create your account" : "Sign in"}</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <input className={input} placeholder="Your name or brand" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input className={input} type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          className={input}
          type="password"
          placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={mode === "signup" ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {mode === "signup" && (
          <>
            <div className="flex gap-2 text-sm">
              {(["creator", "business"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAccountType(t)}
                  className={`flex-1 rounded-md border px-3 py-2 capitalize ${accountType === t ? "bg-foreground text-background" : ""}`}
                >
                  {t === "creator" ? "Content creator" : "Business page"}
                </button>
              ))}
            </div>
            <input
              className={input}
              placeholder="Niche (optional) - e.g. study tips, local bakery"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-40">
          {busy ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="text-sm opacity-70">
        {mode === "signup" ? (
          <>
            Already have an account? <Link href="/login" className="underline">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/signup" className="underline">Create an account</Link>
          </>
        )}
      </p>
    </section>
  );
}
