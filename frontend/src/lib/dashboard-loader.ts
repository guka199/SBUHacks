import { z } from "zod";
import { API_BASE } from "./api";
import {
  accounts as accountApi,
  type Account,
  type ImportJob,
} from "./account-api";
import { loadDashboard } from "./dashboard";
import {
  isPlatform,
  numberOrNull,
  safeUrl,
  timestamp,
  youtubePreview,
  type AnalyticsBundle,
  type ContentRecord,
  type ImportLink,
} from "./dashboard-analytics";

const nullableNumber = z.number().nonnegative().finite().nullable().optional();
const socialPost = z.object({
  post_id: z.string(),
  caption: z.string().default(""),
  url: z.string().nullable().optional(),
  posted_at: z.string().nullable().optional(),
  format: z.string().default("post"),
  views: nullableNumber,
  likes: nullableNumber,
  comments: nullableNumber,
  shares: nullableNumber,
});
const snapshot = z.object({
  last_updated: z.string(),
  followers: nullableNumber,
  posts: z.array(socialPost).max(100).default([]),
});
const context = z.object({
  sources: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        platform: z.string(),
        format: z.string().nullable().optional(),
        title: z.string(),
        text: z.string().optional(),
        published_at: z.string().nullable().optional(),
        updated_at: z.string().nullable().optional(),
        views: nullableNumber,
        likes: nullableNumber,
        comments: nullableNumber,
        shares: nullableNumber,
        url: z.string().nullable().optional(),
      }),
    )
    .max(40),
});

class DashboardReadError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function read<T>(
  path: string,
  signal: AbortSignal,
  schema?: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    signal,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok)
    throw new DashboardReadError(
      response.status,
      response.status === 401
        ? "Sign in to load your dashboard."
        : `Could not load saved data (${response.status}).`,
    );
  const data = await response.json();
  return schema ? schema.parse(data) : (data as T);
}
function accountKey(account: Account): string {
  return `${account.platform}:${account.external_id || account.handle || account.profile_url || account.platform}`;
}
function formatOf(value: string | null | undefined): string {
  const text = (value ?? "post").toLowerCase();
  return ["long", "long_form", "longform", "video"].includes(text)
    ? "video"
    : ["short", "shorts", "reel"].includes(text)
      ? "short"
      : text;
}

export async function loadAnalytics(
  signal: AbortSignal,
): Promise<AnalyticsBundle> {
  const results = await Promise.allSettled([
    loadDashboard(signal),
    read<Account[]>("/accounts", signal),
    read("/ideas/context", signal, context),
    read<ImportLink[]>("/accounts/imports", signal),
    read<AnalyticsBundle["providers"]>("/accounts/providers/status", signal),
  ]);
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  for (const result of results)
    if (
      result.status === "rejected" &&
      result.reason instanceof DashboardReadError &&
      result.reason.status === 401
    )
      throw result.reason;
  const [
    overviewResult,
    accountsResult,
    contextResult,
    linksResult,
    providersResult,
  ] = results;
  if (overviewResult.status === "rejected")
    throw new Error("Could not load your dashboard. Try again in a moment.");
  if (accountsResult.status === "rejected")
    throw new Error(
      "Could not load your connected accounts. Try again in a moment.",
    );
  const overview = overviewResult.value,
    linked = accountsResult.value.filter((a) => isPlatform(a.platform));
  const links = linksResult.status === "fulfilled" ? linksResult.value : [];
  const issues: string[] = [];
  if (contextResult.status === "rejected")
    issues.push("Some saved post history could not load.");
  if (linksResult.status === "rejected")
    issues.push("Account update availability could not load.");
  const byPlatform = new Map(linked.map((a) => [a.platform, a]));
  const records = new Map<string, ContentRecord>();
  if (contextResult.status === "fulfilled")
    for (const source of contextResult.value.sources) {
      if (source.kind !== "published_post" || !isPlatform(source.platform))
        continue;
      const account = byPlatform.get(source.platform);
      if (!account) continue;
      const url = safeUrl(source.url);
      records.set(source.id, {
        id: source.id,
        platform: source.platform,
        account: accountKey(account),
        caption: source.text || source.title,
        format: formatOf(source.format),
        publishedAt: source.published_at ?? null,
        observedAt: source.updated_at || account.updated_at,
        url,
        thumbnail: source.platform === "youtube" ? youtubePreview(url) : null,
        views: numberOrNull(source.views),
        likes: numberOrNull(source.likes),
        comments: numberOrNull(source.comments),
        shares: numberOrNull(source.shares),
      });
    }
  const history: AnalyticsBundle["history"] = {};
  await Promise.all(
    linked.map(async (account) => {
      const link = links.find(
        (l) => l.platform === account.platform && l.snapshot_id,
      );
      if (!link) return;
      const [current, past] = await Promise.allSettled([
        read(`/accounts/${account.platform}/stats`, signal, snapshot),
        read(
          `/accounts/${account.platform}/history?limit=20`,
          signal,
          z.array(snapshot),
        ),
      ]);
      if (current.status === "fulfilled")
        for (const post of current.value.posts) {
          const id = `post:${account.platform}:${post.post_id}`,
            previous = records.get(id),
            url = safeUrl(post.url) || previous?.url || null;
          records.set(id, {
            id,
            platform: account.platform,
            account: accountKey(account),
            caption: post.caption || previous?.caption || "Untitled post",
            format: previous?.format || formatOf(post.format),
            publishedAt: post.posted_at || previous?.publishedAt || null,
            observedAt: current.value.last_updated,
            url,
            thumbnail:
              account.platform === "youtube" ? youtubePreview(url) : null,
            views: numberOrNull(post.views),
            likes: numberOrNull(post.likes),
            comments: numberOrNull(post.comments),
            shares: numberOrNull(post.shares),
          });
        }
      else if (!(
        current.reason instanceof DashboardReadError &&
        current.reason.status === 404
      ))
        issues.push(`${account.platform} post details could not load.`);
      if (past.status === "fulfilled")
        history[account.platform] = past.value.map((s) => ({
          at: s.last_updated,
          followers: s.followers ?? null,
        }));
      else if (!(
        past.reason instanceof DashboardReadError && past.reason.status === 404
      ))
        issues.push(`${account.platform} follower history could not load.`);
    }),
  );
  // The older overview API exposes five rows. Use them only if a platform has no richer post sample.
  const covered = new Set([...records.values()].map((p) => p.platform));
  for (const post of overview.topPosts) {
    if (!isPlatform(post.platform) || covered.has(post.platform)) continue;
    const account = byPlatform.get(post.platform);
    if (!account) continue;
    const url = safeUrl(post.url);
    const id = `overview:${post.platform}:${url || `${post.caption}:${post.postedAt}`}`;
    records.set(id, {
      id,
      platform: post.platform,
      account: accountKey(account),
      caption: post.caption,
      format: "post",
      publishedAt: post.postedAt ?? null,
      observedAt: account.updated_at,
      url,
      thumbnail: post.platform === "youtube" ? youtubePreview(url) : null,
      views: numberOrNull(post.views),
      likes: numberOrNull(post.likes),
      comments: numberOrNull(post.comments),
      shares: null,
    });
  }
  return {
    overview,
    accounts: linked,
    posts: [...records.values()].filter(
      (p) =>
        timestamp(p.publishedAt) == null ||
        timestamp(p.publishedAt)! <= Date.now(),
    ),
    history,
    links,
    providers:
      providersResult.status === "fulfilled" ? providersResult.value : null,
    issues,
    loadedAt: new Date().toISOString(),
  };
}

export function canUpdate(account: Account, data: AnalyticsBundle): boolean {
  if (account.connection !== "api") return false;
  if (data.links.some((link) => link.platform === account.platform && link.active_job)) return false;
  if (
    account.platform === "youtube" &&
    data.providers?.configured.YOUTUBE_API_KEY
  )
    return true;
  return (
    ["instagram", "tiktok"].includes(account.platform) &&
    !!data.providers?.worker_enabled &&
    !!data.providers.configured.APIFY_API_TOKEN &&
    data.links.some((link) => link.platform === account.platform)
  );
}
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
/** Explicit user action only. Loading or changing filters never launches provider collection. */
export async function updateAccount(
  account: Account,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<void> {
  if (account.platform === "youtube") {
    progress("Updating YouTube…");
    await accountApi.connectYouTube(
      account.external_id || account.profile_url || account.handle || "",
    );
    return;
  }
  const response = await fetch(
    `${API_BASE}/accounts/${account.platform}/refresh`,
    {
      method: "POST",
      credentials: "include",
      signal,
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : "Could not start the account update.",
    );
  }
  let job = (await response.json()) as ImportJob;
  const deadline = Date.now() + 12 * 60 * 1000;
  while (!signal.aborted) {
    progress(`${job.phase || "Collecting posts"} · ${job.progress}%`);
    if (job.status === "succeeded") return;
    if (["failed", "needs_attention"].includes(job.status))
      throw new Error(
        job.error ||
          "The account update needs attention. Open Accounts to review it.",
      );
    if (Date.now() > deadline)
      throw new Error(
        "This update is still running. Check its progress in Accounts.",
      );
    await pause(3000, signal);
    job = await read<ImportJob>(
      `/accounts/jobs/${encodeURIComponent(job.id)}`,
      signal,
    );
  }
}
