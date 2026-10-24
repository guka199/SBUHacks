"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { auth } from "@/lib/account-api";
import { useAuth } from "@/lib/auth";

const input = "w-full rounded-md border px-3 py-2 text-sm";
const card = "flex flex-col gap-3 rounded-lg border p-4";

function Status({ ok, error }: { ok: string | null; error: string | null }) {
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (ok) return <p className="text-sm text-green-600">{ok}</p>;
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
    <form onSubmit={save} className={card}>
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
      <div className="flex gap-2 text-sm">
        {(["creator", "business"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setAccountType(t)}
            className={`flex-1 rounded-md border px-3 py-2 ${accountType === t ? "bg-foreground text-background" : ""}`}
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
      <button
        disabled={busy}
        className="w-fit rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-40"
      >
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
    <form onSubmit={save} className={card}>
      <h2 className="font-semibold">Change password</h2>
      <input
        className={input}
        type="password"
        placeholder="Current password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
      />
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
      <input
        className={input}
        type="password"
        placeholder="Repeat new password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />
      <Status ok={ok} error={error} />
      <button
        disabled={busy}
        className="w-fit rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-40"
      >
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
    <form onSubmit={remove} className={`${card} border-red-600/40`}>
      <h2 className="font-semibold text-red-600">Delete account</h2>
      <p className="text-sm opacity-70">
        Permanently deletes your account, connected accounts, scored drafts and
        uploaded images and videos.
      </p>
      <input
        className={input}
        type="password"
        placeholder="Enter your password to confirm"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <Status ok={null} error={error} />
      <button
        disabled={busy || !password}
        className="w-fit rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-40"
      >
        {busy ? "Deleting..." : "Delete my account"}
      </button>
    </form>
  );
}

export default function SettingsPage() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user)
    return (
      <p className="py-8 opacity-70">
        <Link href="/login" className="underline">
          Sign in
        </Link>{" "}
        to manage your settings.
      </p>
    );

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SignOut />
      {/* key: re-create the form with fresh values if a different user signs in */}
      <ProfileForm key={user.id} />
      <PasswordForm />
      <DeleteAccount />
    </section>
  );
}

function SignOut() {
  const { logout } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="text-link"
        onClick={async () => {
          try {
            await logout();
            router.push("/");
          } catch {
            setError("Could not sign out. Please try again.");
          }
        }}
      >
        Sign out
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
