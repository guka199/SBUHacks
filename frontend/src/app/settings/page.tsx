"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { auth } from "@/lib/account-api";
import { useAuth } from "@/lib/auth";

const input = "account-input";
const card = "settings-section product-form form-stack";

function Status({ ok, error }: { ok: string | null; error: string | null }) {
  if (error)
    return (
      <p className="error-message" role="alert">
        {error}
      </p>
    );
  if (ok)
    return (
      <p className="form-success" role="status">
        {ok}
      </p>
    );
  return null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ProfileForm() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.display_name ?? "");
  const [accountType, setAccountType] = useState(
    user?.account_type ?? "creator",
  );
  const [niche, setNiche] = useState(user?.niche ?? "");
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      setUser(
        await auth.updateProfile({
          display_name: name,
          account_type: accountType,
          niche,
        }),
      );
      setOk("Profile saved");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className={card} aria-busy={busy}>
      <h2 className="font-semibold">Profile</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="opacity-70">Name or brand</span>
        <input
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <div className="form-segmented" role="group" aria-label="Account type">
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
      <label className="flex flex-col gap-1 text-sm">
        <span className="opacity-70">Niche</span>
        <input
          className={input}
          placeholder="e.g. study tips, local bakery"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
        />
      </label>
      <p className="text-xs opacity-60">Signed in as {user?.email}</p>
      <Status ok={ok} error={error} />
      <button disabled={busy} className="product-button product-primary">
        {busy ? "Saving..." : "Save profile"}
      </button>
    </form>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setOk(null);
    setError(null);
    if (next !== confirm) return setError("New passwords don't match");
    setBusy(true);
    try {
      await auth.changePassword(current, next);
      setOk("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className={card} aria-busy={busy}>
      <h2 className="font-semibold">Change password</h2>
      <label className="form-field">
        Current password{" "}
        <input
          className={input}
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </label>
      <label className="form-field">
        New password{" "}
        <input
          className={input}
          type="password"
          placeholder="New password (8+ characters)"
          autoComplete="new-password"
          minLength={8}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </label>
      <label className="form-field">
        Confirm new password{" "}
        <input
          className={input}
          type="password"
          placeholder="Repeat new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </label>
      <Status ok={ok} error={error} />
      <button disabled={busy} className="product-button product-primary">
        {busy ? "Saving..." : "Change password"}
      </button>
    </form>
  );
}

function DeleteAccount() {
  const { setUser } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        "Delete your account and all your data permanently? This can't be undone.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await auth.deleteAccount(password);
      setUser(null);
      router.push("/");
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={remove}
      className={`${card} settings-danger`}
      aria-busy={busy}
    >
      <details>
        <summary>Delete account</summary>
        <div className="form-stack">
          <p className="text-sm opacity-70">
            Permanently deletes your account, connected accounts, scored drafts
            and uploaded images and videos.
          </p>
          <label className="form-field">
            Confirm with your password{" "}
            <input
              className={input}
              type="password"
              placeholder="Enter your password to confirm"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <Status ok={null} error={error} />
          <button
            disabled={busy || !password}
            className="product-button product-danger"
          >
            {busy ? "Deleting..." : "Delete my account"}
          </button>
        </div>
      </details>
    </form>
  );
}

export default function SettingsPage() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <p className="product-loading" role="status">
        Opening your settings…
      </p>
    );
  if (!user)
    return (
      <section className="product-empty">
        <h1>Your account settings.</h1>
        <p>Sign in to manage your profile and account security.</p>
        <Link
          href="/login?next=/settings"
          className="product-button product-primary"
        >
          Sign in
        </Link>
      </section>
    );

  return (
    <section className="settings-page">
      <header className="product-page-heading">
        <div>
          <h1>Make it yours.</h1>
          <p>Your profile, preferences, and account security.</p>
        </div>
        <SignOut />
      </header>
      <div className="settings-grid">
        {/* key: re-create the form with fresh values if a different user signs in */}
        <ProfileForm key={user.id} />
        <PasswordForm />
      </div>
      <DeleteAccount />
    </section>
  );
}

function SignOut() {
  const { logout } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="product-button product-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await logout();
            router.push("/");
          } catch {
            setError("Could not sign out. Please try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
