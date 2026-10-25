import { z } from "zod";
import { API_BASE } from "./api";

// Mirrors DashboardOut in api/analysis_schemas.py
const num = z.number().nullable().optional();
export const dashboardSchema = z.object({
  platforms: z.array(
    z.object({
      platform: z.string(),
      handle: z.string().nullable().optional(),
      displayName: z.string().nullable().optional(),
      profileUrl: z.string().nullable().optional(),
      connection: z.string(),
      followers: num,
      typicalViews: num,
      postsPerWeek: num,
      avgLikes: num,
      avgComments: num,
      avgShares: num,
      reachPerFollower: num,
      engagementRate: num,
      engagementBasis: z.enum(["view", "follower"]).nullable().optional(),
      updatedAt: z.string().nullable().optional(),
    }),
  ),
  weekly: z.array(
    z.object({
      platform: z.string(),
      week: z.string(),
      posts: z.number(),
      medianViews: z.number(),
    }),
  ),
  topPosts: z.array(
    z.object({
      platform: z.string(),
      caption: z.string(),
      views: z.number(),
      likes: num,
      comments: num,
      postedAt: z.string().nullable().optional(),
      url: z.string().nullable().optional(),
    }),
  ),
  draftScores: z.array(
    z.object({
      platform: z.string(),
      average: z.number(),
      reports: z.number(),
    }),
  ),
  takeaways: z.array(z.string()),
  strongest: z.string().nullable().optional(),
});
export type DashboardData = z.infer<typeof dashboardSchema>;

export async function loadDashboard(
  signal: AbortSignal,
): Promise<DashboardData> {
  const response = await fetch(`${API_BASE}/api/dashboard`, {
    signal,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : `Could not load your dashboard (${response.status}).`,
    );
  }
  return dashboardSchema.parse(await response.json());
}

/** 1234567 -> "1.2M", 54321 -> "54.3K" */
export function compact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** SVG polyline points for a small trend line, each platform on its own scale. */
export function sparkline(values: number[], width = 120, height = 32): string {
  if (values.length < 2) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`,
    )
    .join(" ");
}
