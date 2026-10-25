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
  waitForImport,
  type Account,
  type Audience,
  type ImportJob,
  type ImportPlatform,
  type ManualAccountInput,
  type Platform,
} from "@/lib/account-api";
import { useAuth } from "@/lib/auth";

const PLATFORMS: {
  id: Platform;
  name: string;
  // youtube: YouTube Data API (instant); scraper: public profile import that runs in the background
  auto: "youtube" | "scraper" | null;
  followersLabel: string;
  hint: string;
  manualHint: string;
  placeholder?: string;
}[] = [
  {
    id: "youtube",
    name: "YouTube",
    auto: "youtube",
    followersLabel: "Subscribers",
    hint: "Paste your channel link or @handle - we fetch your stats automatically.",
    manualHint: "Enter your stats from YouTube Studio → Analytics.",
    placeholder: "youtube.com/@yourchannel",
  },
  {
    id: "tiktok",
    name: "TikTok",
    auto: "scraper",
    followersLabel: "Followers",
    hint: "Enter your @handle - we import your public stats and latest videos automatically (takes about a minute).",
    manualHint: "From TikTok: Profile → menu → Creator tools → Analytics.",
    placeholder: "@yourhandle",
  },
  {
    id: "instagram",
    name: "Instagram",
    auto: "scraper",
    followersLabel: "Followers",
    hint: "Enter your @handle - we import your public stats and latest posts automatically (takes about a minute).",
    manualHint: "From Instagram: Profile → Professional dashboard → Insights.",
    placeholder: "@yourhandle",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    auto: null,
    followersLabel: "Followers",
    hint: "From LinkedIn: your profile or page → Analytics.",
    manualHint: "From LinkedIn: your profile or page → Analytics.",
  },
];
const AGE_RANGES = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"];
const input = "w-full rounded-md border px-2 py-1.5 text-sm";

const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined
    ? "-"
    : n.toLocaleString(undefined, { maximumFractionDigits: digits });
const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

function AudienceFields({
  value,
  onChange,
}: {
  value: Audience;
  onChange: (a: Audience) => void;
}) {
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="col-span-2 mb-1 text-xs font-medium opacity-70">
        Target audience
      </legend>
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
      <input
        className={input}
        placeholder="Language"
        value={value.language ?? ""}
        onChange={(e) =>
          onChange({ ...value, language: e.target.value || undefined })
        }
      />
      <input
        className={`${input} col-span-2`}
        placeholder="Interests (e.g. exams, productivity, coffee)"
        value={value.interests ?? ""}
        onChange={(e) =>
          onChange({ ...value, interests: e.target.value || undefined })
        }
      />
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

const importStage = (phase: string) =>
  phase.endsWith("_launching")
    ? "Starting the import"
    : ({
        queued: "Waiting to start",
        polling: "Collecting your public posts",
        results: "Saving your stats",
        complete: "Done",
      }[phase] ?? "Importing");
const hasAudience = (a: Audience) =>
  Object.values(a).some(
    (v) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length),
  );

function PlatformCard({
  platform,
  account,
  importAvailable,
  onSaved,
  onUnlinked,
}: {
  platform: (typeof PLATFORMS)[number];
  account: Account | undefined;
  importAvailable: boolean;
  onSaved: (a: Account) => void;
  onUnlinked: () => void;
}) {
  const auto = platform.auto;
  // Scraper imports need the backend's Apify token and worker: the option stays visible but can't run.
  const blocked = auto === "scraper" && !importAvailable;
  const [editing, setEditing] = useState(!account);
  const [manual, setManual] = useState(!auto || blocked);
  const [channel, setChannel] = useState(
    auto === "scraper" && account?.handle ? `@${account.handle}` : "",
  );
  const [authorized, setAuthorized] = useState(false);
  const [progress, setProgress] = useState("");
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
      setProgress("");
    }
  }

  // Start (or refresh) a background import, wait for it, then load the saved account.
  async function scrape(start: () => Promise<ImportJob>) {
    setProgress("Starting the import");
    await waitForImport(await start(), (job) =>
      setProgress(
        `${importStage(job.phase)}${job.progress ? ` · ${job.progress}%` : ""}`,
      ),
    );
    const saved = (await api.list()).find((a) => a.platform === platform.id);
    if (!saved)
      throw new Error("The import finished but no account was saved.");
    return hasAudience(audience)
      ? api.updateAudience(platform.id, audience)
      : saved;
  }
  const connect = () =>
    run(() =>
      auto === "scraper"
        ? scrape(() =>
            api.importProfile(platform.id as ImportPlatform, channel),
          )
        : api.connectYouTube(channel, audience),
    );

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
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
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

      {progress && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <span className="status-dot" /> {progress}
        </p>
      )}
      {error && !editing && <p className="text-sm text-red-600">{error}</p>}
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
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat
              label={platform.followersLabel}
              value={fmt(account.followers)}
            />
            <Stat label="Typical views" value={fmt(account.typical_views)} />
            <Stat
              label="Engagement"
              value={
                account.engagement_rate
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
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border px-3 py-1"
            >
              Edit
            </button>
            {auto && account.connection === "api" && (
              <button
                disabled={busy}
                onClick={() =>
                  run(() =>
                    auto === "scraper"
                      ? scrape(() =>
                          api.refreshImport(platform.id as ImportPlatform),
                        )
                      : api.connectYouTube(
                          account.external_id ?? account.handle ?? "",
                        ),
                  )
                }
                className="rounded-md border px-3 py-1 disabled:opacity-40"
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
              className="ml-auto rounded-md px-3 py-1 text-red-600"
            >
              Unlink
            </button>
          </div>
        </>
      )}

      {editing && (
        <>
          <p className="text-xs opacity-60">
            {manual ? platform.manualHint : platform.hint}
          </p>
          {blocked && !manual && (
            <p className="rounded-md border px-3 py-2 text-xs">
              Automatic import isn’t set up on this server yet. Add{" "}
              <code>APIFY_API_TOKEN</code> and{" "}
              <code>SOCIAL_WORKER_ENABLED=true</code> to the backend’s{" "}
              <code>.env</code> and restart it - or enter your stats manually.
            </p>
          )}
          {auto && !manual ? (
            <div className="flex flex-col gap-2">
              <input
                className={input}
                placeholder={platform.placeholder}
                value={channel}
                disabled={busy}
                onChange={(e) => setChannel(e.target.value)}
              />
              {auto === "scraper" && (
                <label className="flex items-start gap-2 text-xs opacity-80">
                  <input
                    type="checkbox"
                    checked={authorized}
                    disabled={busy}
                    onChange={(e) => setAuthorized(e.target.checked)}
                  />
                  This is my account, or I have permission to import it. Only
                  public profile data is collected.
                </label>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 flex flex-col gap-1 text-xs">
                <span className="opacity-70">Handle</span>
                <input
                  className={input}
                  placeholder="@yourhandle"
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
          <AudienceFields value={audience} onChange={setAudience} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              disabled={
                busy ||
                (auto && !manual
                  ? !channel.trim() ||
                    (auto === "scraper" && (!authorized || blocked))
                  : !(form.handle ?? "").trim())
              }
              onClick={() => (auto && !manual ? connect() : saveManual())}
              className="rounded-md bg-foreground px-3 py-1.5 text-background disabled:opacity-40"
            >
              {busy
                ? auto === "scraper" && !manual
                  ? "Importing..."
                  : "Saving..."
                : auto === "scraper" && !manual
                  ? "Connect automatically"
                  : auto && !manual
                    ? "Connect channel"
                    : "Save"}
            </button>
            {account && (
              <button
                onClick={() => setEditing(false)}
                className="rounded-md border px-3 py-1.5"
              >
                Cancel
              </button>
            )}
            {auto && (
              <button
                disabled={busy}
                onClick={() => setManual(!manual)}
                className="ml-auto text-xs underline opacity-70"
              >
                {manual ? "Link automatically instead" : "Enter stats manually"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const { user, loading } = useAuth();
  const [linked, setLinked] = useState<Account[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [importAvailable, setImportAvailable] = useState(false);

  useEffect(() => {
    if (user)
      api
        .importStatus()
        .then((status) =>
          setImportAvailable(
            status.worker_enabled && !!status.configured.APIFY_API_TOKEN,
          ),
        )
        .catch(() => setImportAvailable(false));
  }, [user]);

  useEffect(() => {
    if (user)
      api
        .list()
        .then(setLinked)
        .catch((error) =>
          setLoadError(
            error instanceof Error ? error.message : "Could not load accounts",
          ),
        );
  }, [user]);

  if (loading) return null;
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
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Connected accounts</h1>
        <p className="text-sm opacity-70">
          Your follower counts, typical views and audience make every score
          personal to you.
        </p>
      </div>
      {loadError ? (
        <p role="alert" className="error-message">
          {loadError}
        </p>
      ) : linked === null ? (
        <p className="text-sm opacity-60">Loading...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {PLATFORMS.map((p) => (
            <PlatformCard
              // remount when the saved account changes, so the form starts from fresh values
              key={`${p.id}-${linked.find((a) => a.platform === p.id)?.updated_at ?? "new"}-${importAvailable}`}
              platform={p}
              importAvailable={importAvailable}
              account={linked.find((a) => a.platform === p.id)}
              onSaved={(a) =>
                setLinked([
                  ...linked.filter((x) => x.platform !== a.platform),
                  a,
                ])
              }
              onUnlinked={() =>
                setLinked(linked.filter((x) => x.platform !== p.id))
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
