"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const formFrom = (account: Account | undefined): Record<string, string> => ({
  handle: account?.handle ?? "",
  followers: account?.followers?.toString() ?? "",
  avg_views: account?.avg_views?.toString() ?? "",
  avg_likes: account?.avg_likes?.toString() ?? "",
  avg_comments: account?.avg_comments?.toString() ?? "",
  avg_shares: account?.avg_shares?.toString() ?? "",
  posts_per_week: account?.posts_per_week?.toString() ?? "",
});
import {
  accounts as api,
  type Account,
  type Audience,
  type ManualAccountInput,
  type Platform,
} from "@/lib/account-api";
import { useAuth } from "@/lib/auth";

const PLATFORMS: {
  id: Platform;
  name: string;
  auto: boolean;
  followersLabel: string;
  hint: string;
}[] = [
  {
    id: "youtube",
    name: "YouTube",
    auto: true,
    followersLabel: "Subscribers",
    hint: "Paste your channel link or @handle - we fetch your stats automatically.",
  },
  {
    id: "tiktok",
    name: "TikTok",
    auto: false,
    followersLabel: "Followers",
    hint: "From TikTok: Profile → menu → Creator tools → Analytics.",
  },
  {
    id: "instagram",
    name: "Instagram",
    auto: false,
    followersLabel: "Followers",
    hint: "From Instagram: Profile → Professional dashboard → Insights.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    auto: false,
    followersLabel: "Followers",
    hint: "From LinkedIn: your profile or page → Analytics.",
  },
];
const AGE_RANGES = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"];
const input = "account-input";

const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined
    ? "-"
    : n.toLocaleString(undefined, { maximumFractionDigits: digits });
const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

function AudienceFields({
  value,
  onChange,
  disabled = false,
}: {
  disabled?: boolean;
  value: Audience;
  onChange: (a: Audience) => void;
}) {
  return (
    <fieldset className="audience-fields form-grid" disabled={disabled}>
      <legend className="col-span-2 mb-1 text-xs font-medium opacity-70">
        Target audience
      </legend>
      <label className="form-field">
        Main age range
        <select
          className={input}
          value={value.age_range ?? ""}
          onChange={(e) =>
            onChange({ ...value, age_range: e.target.value || undefined })
          }
        >
          <option value="">Main age range</option>
          {AGE_RANGES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="form-field">
        Female audience (%){" "}
        <input
          className={input}
          type="number"
          min={0}
          max={100}
          placeholder="% female"
          value={value.percent_female ?? ""}
          onChange={(e) =>
            onChange({ ...value, percent_female: num(e.target.value) })
          }
        />
      </label>
      <label className="form-field">
        Top countries{" "}
        <input
          className={input}
          placeholder="Top countries (US, UK)"
          value={value.top_countries?.join(", ") ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              top_countries: e.target.value
                ? e.target.value
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean)
                : undefined,
            })
          }
        />
      </label>
      <label className="form-field">
        Language{" "}
        <input
          className={input}
          placeholder="Language"
          value={value.language ?? ""}
          onChange={(e) =>
            onChange({ ...value, language: e.target.value || undefined })
          }
        />
      </label>
      <label className="form-field">
        Interests{" "}
        <input
          className={`${input} col-span-2`}
          placeholder="Interests (e.g. exams, productivity, coffee)"
          value={value.interests ?? ""}
          onChange={(e) =>
            onChange({ ...value, interests: e.target.value || undefined })
          }
        />
      </label>
    </fieldset>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs opacity-60">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

function PlatformCard({
  platform,
  account,
  onSaved,
  onUnlinked,
}: {
  platform: (typeof PLATFORMS)[number];
  account: Account | undefined;
  onSaved: (a: Account) => void;
  onUnlinked: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [manual, setManual] = useState(!platform.auto);
  const [channel, setChannel] = useState("");
  const [form, setForm] = useState<Record<string, string>>(formFrom(account));
  const [audience, setAudience] = useState<Audience>(account?.audience ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<Account>) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await action());
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const saveManual = () => {
    const body: ManualAccountInput = {
      handle: form.handle ?? "",
      followers: num(form.followers ?? ""),
      avg_views: num(form.avg_views ?? ""),
      avg_likes: num(form.avg_likes ?? ""),
      avg_comments: num(form.avg_comments ?? ""),
      avg_shares: num(form.avg_shares ?? ""),
      posts_per_week: num(form.posts_per_week ?? ""),
      audience,
    };
    return run(() => api.saveManual(platform.id, body));
  };

  const field = (key: string, label: string) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="opacity-70">{label}</span>
      <input
        className={input}
        type="number"
        min={0}
        step={key === "followers" ? 1 : "any"}
        disabled={busy}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <article
      className="account-card product-form"
      aria-label={`${platform.name} account`}
      aria-busy={busy}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{platform.name}</h2>
        {account && (
          <span className="rounded-full border px-2 py-0.5 text-xs opacity-70">
            {account.connection === "api"
              ? "Linked automatically"
              : "Entered manually"}
          </span>
        )}
      </div>

      {!account && !editing && (
        <div className="account-setup">
          <p>
            {platform.auto
              ? "Link your channel to bring its stats into your next analysis."
              : "Add your public stats and audience to personalize your analysis."}
          </p>
          <span className="connection-note">
            {platform.auto ? "Automatic YouTube lookup" : "Manual stats entry"}
          </span>
          <button
            className="product-button product-secondary"
            onClick={() => setEditing(true)}
          >
            Add {platform.name} account
          </button>
        </div>
      )}
      {account && !editing && (
        <>
          <div className="text-sm">
            {account.profile_url ? (
              <a
                href={account.profile_url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {account.display_name ?? account.handle}
              </a>
            ) : (
              (account.display_name ?? account.handle)
            )}
          </div>
          <div className="account-stats">
            <Stat
              label={platform.followersLabel}
              value={fmt(account.followers)}
            />
            <Stat label="Typical views" value={fmt(account.typical_views)} />
            <Stat
              label="Engagement"
              value={
                account.engagement_rate != null
                  ? `${(account.engagement_rate * 100).toFixed(2)}%`
                  : "-"
              }
            />
            <Stat label="Avg likes" value={fmt(account.avg_likes)} />
            <Stat label="Avg comments" value={fmt(account.avg_comments)} />
            <Stat label="Posts / week" value={fmt(account.posts_per_week, 1)} />
          </div>
          {Object.keys(account.audience ?? {}).length > 0 && (
            <p className="text-xs opacity-70">
              Audience:{" "}
              {[
                account.audience.age_range &&
                  `ages ${account.audience.age_range}`,
                account.audience.percent_female !== undefined &&
                  `${account.audience.percent_female}% female`,
                account.audience.top_countries?.join(", "),
                account.audience.interests,
                account.audience.language,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <div className="account-actions">
            <button
              onClick={() => setEditing(true)}
              disabled={busy}
              className="product-button product-secondary"
            >
              Edit
            </button>
            {platform.auto && account.connection === "api" && (
              <button
                disabled={busy}
                onClick={() =>
                  run(() =>
                    api.connectYouTube(
                      account.external_id ?? account.handle ?? "",
                    ),
                  )
                }
                className="product-button product-secondary"
              >
                {busy ? "Refreshing..." : "Refresh stats"}
              </button>
            )}
            <button
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await api.unlink(platform.id);
                  onUnlinked();
                  setEditing(true);
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Could not unlink account",
                  );
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="product-button product-quiet"
            >
              Unlink
            </button>
          </div>
        </>
      )}

      {editing && (
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            void (platform.auto && !manual
              ? run(() => api.connectYouTube(channel, audience))
              : saveManual());
          }}
        >
          <p className="text-xs opacity-60">
            {manual
              ? platform.hint.replace(
                  /^Paste.*automatically\. ?/,
                  "Enter your stats from YouTube Studio → Analytics.",
                )
              : platform.hint}
          </p>
          {platform.auto && !manual ? (
            <label className="form-field">
              YouTube channel URL or handle
              <input
                aria-label="YouTube channel URL or handle"
                required
                disabled={busy}
                className={input}
                placeholder="youtube.com/@yourchannel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 flex flex-col gap-1 text-xs">
                <span className="opacity-70">Handle</span>
                <input
                  className={input}
                  placeholder="@yourhandle"
                  required
                  disabled={busy}
                  value={form.handle ?? ""}
                  onChange={(e) => setForm({ ...form, handle: e.target.value })}
                />
              </label>
              {field("followers", platform.followersLabel)}
              {field("avg_views", "Avg views per post")}
              {field("avg_likes", "Avg likes")}
              {field("avg_comments", "Avg comments")}
              {platform.id !== "youtube" && field("avg_shares", "Avg shares")}
              {field("posts_per_week", "Posts per week")}
            </div>
          )}
          <details className="audience-disclosure">
            <summary>
              Target audience <span>Optional</span>
            </summary>
            <AudienceFields
              value={audience}
              onChange={setAudience}
              disabled={busy}
            />
          </details>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              disabled={
                busy ||
                (platform.auto && !manual
                  ? !channel.trim()
                  : !(form.handle ?? "").trim())
              }
              type="submit"
              className="product-button product-primary"
            >
              {busy
                ? "Saving..."
                : platform.auto && !manual
                  ? "Connect channel"
                  : "Save"}
            </button>
            {
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setForm(formFrom(account));
                  setAudience(account?.audience ?? {});
                  setError(null);
                }}
                disabled={busy}
                className="product-button product-secondary"
              >
                Cancel
              </button>
            }
            {platform.auto && (
              <button
                type="button"
                onClick={() => setManual(!manual)}
                disabled={busy}
                className="product-button product-quiet"
              >
                {manual ? "Link automatically instead" : "Enter stats manually"}
              </button>
            )}
          </div>
        </form>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

export default function AccountsPage() {
  const { user, loading } = useAuth();
  const [linked, setLinked] = useState<Account[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (user)
      api
        .list()
        .then((value) => {
          if (!cancelled) {
            setLinked(value);
            setLoadError("");
          }
        })
        .catch(
          (error) =>
            !cancelled &&
            setLoadError(
              error instanceof Error
                ? error.message
                : "Could not load accounts",
            ),
        );
    return () => {
      cancelled = true;
    };
  }, [user, reload]);

  if (loading)
    return (
      <p className="product-loading" role="status">
        Opening your accounts…
      </p>
    );
  if (!user)
    return (
      <section className="flex flex-col gap-3 py-8">
        <h1 className="text-2xl font-semibold">Connected accounts</h1>
        <p className="opacity-70">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/signup" className="underline">
            create an account
          </Link>{" "}
          to connect your social accounts.
        </p>
      </section>
    );

  return (
    <section className="accounts-page">
      <div>
        <h1 className="text-2xl font-semibold">Connected accounts</h1>
        <p className="text-sm opacity-70">
          Your follower counts, typical views and audience make every score
          personal to you.
        </p>
      </div>
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      {loadError ? (
        <div className="error-message" role="alert">
          {loadError}{" "}
          <button
            className="product-button product-secondary"
            onClick={() => {
              setLoadError("");
              setReload((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : linked === null ? (
        <p className="product-loading" role="status">
          Loading connected accounts…
        </p>
      ) : (
        <div className="accounts-grid">
          {PLATFORMS.map((p) => (
            <PlatformCard
              // remount when the saved account changes, so the form starts from fresh values
              key={`${p.id}-${linked.find((a) => a.platform === p.id)?.updated_at ?? "new"}`}
              platform={p}
              account={linked.find((a) => a.platform === p.id)}
              onSaved={(a) => {
                setNotice(`${p.name} account saved.`);
                setLinked([
                  ...linked.filter((x) => x.platform !== a.platform),
                  a,
                ]);
              }}
              onUnlinked={() => {
                setLinked(linked.filter((x) => x.platform !== p.id));
                setNotice(`${p.name} account unlinked.`);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
