import type { Account, Platform } from "./account-api";
import type { DashboardData } from "./dashboard";

export const networkOrder: Platform[] = [
  "youtube",
  "instagram",
  "tiktok",
  "linkedin",
];
export const networks: Record<
  Platform,
  { name: string; color: string; dash: string }
> = {
  youtube: { name: "YouTube", color: "#BE1A1A", dash: "" },
  instagram: { name: "Instagram", color: "#7A3E9D", dash: "7 3" },
  tiktok: { name: "TikTok", color: "#087C73", dash: "2 3" },
  linkedin: { name: "LinkedIn", color: "#2864B4", dash: "10 3 2 3" },
};
export type Scope = Platform | "all";
export type Range = "30" | "90" | "365" | "all";
export type Ranking = "lift" | "views" | "likes" | "engagement";
export type ChartMetric = "views" | "engagement" | "audience";
export const ranges: Record<Range, string> = {
  "30": "Last 30 days",
  "90": "Last 90 days",
  "365": "Last 12 months",
  all: "All collected",
};
export const rankNames: Record<Ranking, string> = {
  lift: "Response lift",
  views: "Views",
  likes: "Likes / reactions",
  engagement: "Engagement rate",
};

export interface ContentRecord {
  id: string;
  platform: Platform;
  account: string;
  caption: string;
  format: string;
  publishedAt: string | null;
  observedAt: string | null;
  url: string | null;
  thumbnail: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}
export interface AudienceObservation {
  at: string;
  followers: number | null;
}
export interface ImportLink {
  platform: Platform;
  snapshot_id?: string | null;
  profile_url: string;
  active_job?: string | null;
}
export interface AnalyticsBundle {
  overview: DashboardData;
  accounts: Account[];
  posts: ContentRecord[];
  history: Partial<Record<Platform, AudienceObservation[]>>;
  links: ImportLink[];
  providers: {
    configured: Record<string, boolean>;
    worker_enabled: boolean;
  } | null;
  issues: string[];
  loadedAt: string;
}
export interface RankedContent extends ContentRecord {
  rankValue: number;
  peers: number;
  baseline: number | null;
}
export interface PlotPoint {
  value: number;
  count: number;
}
export interface PlotSeries {
  platform: Platform;
  points: (PlotPoint | null)[];
}
export interface PlotModel {
  times: number[];
  labels: string[];
  fullLabels: string[];
  series: PlotSeries[];
  unit: string;
  snapshot: boolean;
  audienceBars: boolean;
  cadence: string;
}

export function isPlatform(value: string): value is Platform {
  return networkOrder.includes(value as Platform);
}
export function known(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
export function numberOrNull(value: unknown): number | null {
  return known(value) ? value : null;
}
export function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let text = value.trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += "T00:00:00";
  if (!/(Z|[+-]\d\d:\d\d)$/i.test(text)) text += "Z";
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}
export function dateLabel(value: string | number | null, full = false): string {
  const time = typeof value === "number" ? value : timestamp(value);
  if (time == null) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(full ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(time);
}
export function count(
  value: number | null | undefined,
  compact = true,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(
    "en-US",
    compact
      ? { notation: "compact", maximumFractionDigits: 1 }
      : { maximumFractionDigits: 0 },
  ).format(value);
}
export function sumKnown(values: (number | null | undefined)[]): number | null {
  const available = values.filter(known);
  return available.length ? available.reduce((a, b) => a + b, 0) : null;
}
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function youtubePreview(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const id =
      parsed.hostname === "youtu.be"
        ? parsed.pathname.slice(1)
        : ["youtube.com", "www.youtube.com"].includes(parsed.hostname)
          ? parsed.searchParams.get("v")
          : null;
    return id && /^[\w-]{11}$/.test(id)
      ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      : null;
  } catch {
    return null;
  }
}
export function interactionCount(post: ContentRecord): number | null {
  return post.likes != null && post.comments != null
    ? post.likes + post.comments
    : null;
}
/** A common numerator and denominator. LinkedIn private impressions are never treated as video views. */
export function engagementRate(post: ContentRecord): number | null {
  const interactions = interactionCount(post);
  return post.platform !== "linkedin" &&
    post.views != null &&
    post.views > 0 &&
    interactions != null
    ? interactions / post.views
    : null;
}
export function inRange(
  post: ContentRecord,
  range: Range,
  now = Date.now(),
): boolean {
  const published = timestamp(post.publishedAt);
  if (published != null && published > now) return false;
  return (
    range === "all" ||
    (published != null && published >= now - Number(range) * 86400000)
  );
}
export function selectPosts(
  posts: ContentRecord[],
  scope: Scope,
  range: Range,
  now = Date.now(),
): ContentRecord[] {
  return posts.filter(
    (post) =>
      (scope === "all" || post.platform === scope) && inRange(post, range, now),
  );
}
function cohort(post: ContentRecord): string | null {
  const captured = timestamp(post.observedAt),
    published = timestamp(post.publishedAt);
  if (captured == null || published == null || captured < published)
    return null;
  const age = Math.floor((captured - published) / 86400000);
  const band =
    age < 7
      ? "0–6d"
      : age <= 30
        ? "7–30d"
        : age <= 90
          ? "31–90d"
          : age <= 365
            ? "91–365d"
            : "365d+";
  return `${post.account}|${post.platform}|${post.format}|${band}`;
}
/** Baselines use all collected peers, so changing a publication filter doesn't change a post's lift. */
export function rankContent(
  all: ContentRecord[],
  visible: ContentRecord[],
  ranking: Ranking,
): RankedContent[] {
  const groups = new Map<string, number[]>();
  for (const post of all) {
    const key = cohort(post),
      value = interactionCount(post);
    if (key && value != null)
      groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return visible
    .flatMap((post) => {
      const peers = groups.get(cohort(post) ?? "") ?? [];
      const baseline = median(peers),
        interactions = interactionCount(post);
      const value =
        ranking === "lift"
          ? peers.length >= 3 &&
            baseline != null &&
            baseline > 0 &&
            interactions != null
            ? interactions / baseline
            : null
          : ranking === "engagement"
            ? engagementRate(post)
            : ranking === "views"
              ? post.platform === "linkedin"
                ? null
                : post.views
              : post.likes;
      return value == null
        ? []
        : [{ ...post, rankValue: value, peers: peers.length, baseline }];
    })
    .sort(
      (a, b) =>
        b.rankValue - a.rankValue ||
        (timestamp(b.publishedAt) ?? 0) - (timestamp(a.publishedAt) ?? 0) ||
        a.id.localeCompare(b.id),
    );
}
export function rankValue(value: number, ranking: Ranking): string {
  return ranking === "lift"
    ? `${value.toFixed(2)}×`
    : ranking === "engagement"
      ? `${(value * 100).toFixed(1)}%`
      : count(value);
}
export function growth(
  history: AudienceObservation[],
  range: Range,
  now = Date.now(),
): { delta: number; since: string; through: string } | null {
  const cutoff = range === "all" ? -Infinity : now - Number(range) * 86400000;
  const points = history
    .filter(
      (point) =>
        point.followers != null &&
        (timestamp(point.at) ?? -Infinity) >= cutoff &&
        (timestamp(point.at) ?? Infinity) <= now,
    )
    .sort((a, b) => timestamp(a.at)! - timestamp(b.at)!);
  if (
    points.length < 2 ||
    timestamp(points[0].at) === timestamp(points.at(-1)!.at)
  )
    return null;
  return {
    delta: points.at(-1)!.followers! - points[0].followers!,
    since: points[0].at,
    through: points.at(-1)!.at,
  };
}
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 4;
  const step = Math.max(1, 10 ** Math.floor(Math.log10(value / 4)));
  const raw = value / 4 / step;
  const unit = raw < 1 ? 1 : raw < 2 ? 2 : raw < 5 ? 5 : 10;
  return 4 * unit * step;
}

/** Publication cohorts show captured lifetime outcomes, not views earned during that week/month. */
export function publicationPlot(
  posts: ContentRecord[],
  scope: Scope,
  range: Range,
  metric: "views" | "engagement",
  now = Date.now(),
): PlotModel {
  const visible = selectPosts(posts, scope, range, now);
  const dates = visible
    .map((post) => timestamp(post.publishedAt))
    .filter((v): v is number => v != null);
  const end = range === "all" && dates.length ? Math.max(...dates) : now;
  const start =
    range === "all"
      ? dates.length
        ? Math.min(...dates)
        : now - 30 * 86400000
      : now - Number(range) * 86400000;
  const days = (end - start) / 86400000;
  const months = days > 2160 ? 12 : days > 540 ? 3 : days > 90 ? 1 : 0;
  const floor = (time: number) => {
    const date = new Date(time);
    if (months)
      return Date.UTC(
        date.getUTCFullYear(),
        Math.floor(date.getUTCMonth() / months) * months,
        1,
      );
    const day = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    );
    return day - ((date.getUTCDay() + 6) % 7) * 86400000;
  };
  const times: number[] = [];
  for (let time = floor(start); time <= end && times.length < 110;) {
    times.push(time);
    const date = new Date(time);
    time = months
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)
      : time + 7 * 86400000;
  }
  const buckets = new Map<string, number[]>();
  for (const post of visible) {
    const date = timestamp(post.publishedAt),
      value =
        metric === "views"
          ? post.platform === "linkedin"
            ? null
            : post.views
          : interactionCount(post);
    if (date == null || value == null) continue;
    const key = `${post.platform}:${floor(date)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), value]);
  }
  const series = networkOrder
    .filter((p) => scope === "all" || p === scope)
    .map((platform) => ({
      platform,
      points: times.map((time) => {
        const values = buckets.get(`${platform}:${time}`);
        return values?.length
          ? { value: median(values)!, count: values.length }
          : null;
      }),
    }))
    .filter((s) => s.points.some(Boolean));
  return {
    times,
    labels: times.map((t) =>
      months
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            ...(days > 540 ? { year: "2-digit" } : {}),
            timeZone: "UTC",
          }).format(t)
        : dateLabel(t),
    ),
    fullLabels: times.map(
      (t) =>
        `${months === 12 ? "Year" : months === 3 ? "Quarter" : months ? "Month" : "Week"} of ${dateLabel(t, true)}`,
    ),
    series,
    unit:
      metric === "views" ? "Median recorded views" : "Median likes + comments",
    snapshot: false,
    audienceBars: false,
    cadence:
      months === 12
        ? "year"
        : months === 3
          ? "quarter"
          : months
            ? "month"
            : "week",
  };
}
export function audiencePlot(
  bundle: AnalyticsBundle,
  scope: Scope,
  range: Range,
  now = Date.now(),
): PlotModel {
  const accounts = bundle.accounts.filter(
    (a) => scope === "all" || a.platform === scope,
  );
  const cutoff = range === "all" ? -Infinity : now - Number(range) * 86400000;
  const histories = accounts.map((account) => ({
    platform: account.platform,
    points: (bundle.history[account.platform] ?? []).filter(
      (p) =>
        p.followers != null &&
        timestamp(p.at) != null &&
        timestamp(p.at)! >= cutoff &&
        timestamp(p.at)! <= now,
    ),
  }));
  const times = [
    ...new Set(histories.flatMap((h) => h.points.map((p) => timestamp(p.at)!))),
  ].sort((a, b) => a - b);
  const hasHistory = histories.some(
    (h) => new Set(h.points.map((p) => timestamp(p.at))).size >= 2,
  );
  if (!hasHistory)
    return {
      times: [],
      labels: [],
      fullLabels: [],
      series: accounts
        .filter((a) => a.followers != null)
        .map((a) => ({
          platform: a.platform,
          points: [{ value: a.followers!, count: 1 }],
        })),
      unit: "Current followers / subscribers",
      snapshot: true,
      audienceBars: true,
      cadence: "snapshot",
    };
  return {
    times,
    labels: times.map((t) => dateLabel(t)),
    fullLabels: times.map((t) => dateLabel(t, true)),
    series: histories
      .map((h) => ({
        platform: h.platform,
        points: times.map((time) => {
          const p = h.points.find((p) => timestamp(p.at) === time);
          return p ? { value: p.followers!, count: 1 } : null;
        }),
      }))
      .filter((s) => s.points.some(Boolean)),
    unit: "Followers / subscribers",
    snapshot: true,
    audienceBars: false,
    cadence: "collection",
  };
}
