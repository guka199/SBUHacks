"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { auth } from "@/lib/account-api";
import { useAuth } from "@/lib/auth";
import { DragonArtwork } from "./auth/dragon-artwork";
import artworkStyles from "./auth/dragon-artwork.module.css";

const input = "account-input";

/** Shared sign-up / sign-in form. After success it goes to /accounts (new users) or /score. */
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const { setUser } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<"creator" | "business">(
    "creator",
  );
  const [niche, setNiche] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shimmerKey, setShimmerKey] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setShimmerKey((value) => value + 1);
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === "signup"
          ? await auth.signup({
              email,
              password,
              display_name: name,
              account_type: accountType,
              niche: niche || undefined,
            })
          : await auth.login(email, password);
      setUser(user);
      const next =
        new URLSearchParams(window.location.search).get("next") ?? "";
      router.push(
        /^\/(analysis\/[0-9a-f]{32}|dashboard|reports|accounts|analyze|ideas|settings)$/.test(
          next,
        )
          ? next
          : mode === "signup"
            ? "/accounts"
            : "/analyze",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={artworkStyles.stage}>
      <DragonArtwork shimmerKey={shimmerKey} />
      <div className={artworkStyles.formArea}>
        <section className="auth-panel product-form">
          <h1 className="text-2xl font-semibold">
            {mode === "signup" ? "Create your account" : "Sign in"}
          </h1>
          <p className="form-intro">
            {mode === "signup"
              ? "Your videos, ideas, and creative decisions. All in one place."
              : "Pick up where your next good idea left off."}
          </p>
          <form onSubmit={submit} className="form-stack" aria-busy={busy}>
            {mode === "signup" && (
              <label className="form-field">
                Name or brand
                <input
                  autoComplete="name"
                  className={input}
                  placeholder="Your name or brand"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
            )}
            <label className="form-field">
              Email
              <input
                className={input}
                type="email"
                placeholder="Email"
                autoComplete="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              Password
              <input
                className={input}
                type="password"
                placeholder={
                  mode === "signup" ? "Password (8+ characters)" : "Password"
                }
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                minLength={mode === "signup" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {mode === "signup" && (
              <>
                <div
                  className="form-segmented"
                  role="group"
                  aria-label="Account type"
                >
                  {(["creator", "business"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAccountType(t)}
                      aria-pressed={accountType === t}
                      className="product-toggle"
                    >
                      {t === "creator" ? "Content creator" : "Business page"}
                    </button>
                  ))}
                </div>
                <label className="form-field">
                  Niche <span className="field-optional">Optional</span>
                  <input
                    className={input}
                    placeholder="Niche (optional) - e.g. study tips, local bakery"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                  />
                </label>
              </>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button disabled={busy} className="product-button product-primary">
              {busy
                ? "Please wait..."
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
          <p className="text-sm opacity-70">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <Link href="/login" className="underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link href="/signup" className="underline">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
