import { z } from "zod";
import { API_BASE } from "./api";

export const ideaPlatforms = [
  "youtube",
  "shorts",
  "tiktok",
  "instagram",
  "linkedin",
] as const;
export const ideaPlatformSchema = z.enum(ideaPlatforms);
export type IdeaPlatform = z.infer<typeof ideaPlatformSchema>;
export const ideaTargetSchema = z.enum([...ideaPlatforms, "all_platforms"]);
export type IdeaTarget = z.infer<typeof ideaTargetSchema>;
export const platformNames: Record<string, string> = {
  youtube: "YouTube",
  shorts: "YouTube Shorts",
  tiktok: "TikTok",
  instagram: "Instagram Reels",
  linkedin: "LinkedIn",
  all_platforms: "All platforms",
};
const sourceSchema = z.object({
  id: z.string(),
  kind: z.enum(["published_post", "analyzed_draft", "scored_draft"]),
  platform: z.string(),
  format: z.string().nullable(),
  title: z.string(),
  text: z.string(),
  summary: z.string(),
  review_notes: z.array(z.string()),
  review_kind: z.enum(["gemini", "model_only", "none"]),
  published_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  age_days: z.number().nullable(),
  age_days_at_snapshot: z.number().nullable().optional(),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullable(),
  relative_views: z.number().nullable(),
  comparison_count: z.number().nullable(),
  comparison_median_views: z.number().nullable(),
  comparison_label: z.string().nullable(),
  url: z.string().nullable(),
});
export type IdeaSource = z.infer<typeof sourceSchema>;
export const ideaKindNames = {
  follow_up: "Follow-up",
  trend_inspired: "Trend-inspired",
  evergreen: "Evergreen",
} as const;
export const trendRegions: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  IN: "India",
  DE: "Germany",
  FR: "France",
  BR: "Brazil",
  MX: "Mexico",
  JP: "Japan",
  KR: "South Korea",
  UA: "Ukraine",
  GE: "Georgia",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  PL: "Poland",
};
const ideaKindSchema = z.enum(["follow_up", "trend_inspired", "evergreen"]);
const trendEvidenceSchema = z.object({
  id: z.string(),
  platform: ideaPlatformSchema,
  region_code: z.string(),
  title: z.string(),
  summary: z.string(),
  url: z.string(),
  published_at: z.string(),
  date_status: z.enum(["api_verified", "source_reported"]),
  observed_at: z.string(),
  provider: z.enum(["youtube_data", "google_search"]),
  views: z.number().nullable(),
});
export type TrendEvidence = z.infer<typeof trendEvidenceSchema>;
export const trendResearchSchema = z.object({
  status: z.enum([
    "available",
    "unavailable",
    "disabled",
    "needs_topic",
    "needs_platform",
  ]),
  platform: ideaPlatformSchema.nullable(),
  region_code: z.string(),
  topic: z.string(),
  checked_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  cached: z.boolean(),
  sources: z.array(trendEvidenceSchema),
  search_suggestions: z.array(z.string()),
  notes: z.array(z.string()),
});
export type TrendResearch = z.infer<typeof trendResearchSchema>;
export type TrendOptions = {
  use_trends: boolean;
  region_code: string;
  trend_topic: string | null;
};
export const creatorGoals = [
  "growth",
  "engagement",
  "sales",
  "series",
] as const;
export const goalNames: Record<(typeof creatorGoals)[number], string> = {
  growth: "Grow my audience",
  engagement: "Start more conversations",
  sales: "Support sales",
  series: "Build a continuing series",
};
export const creatorPreferencesSchema = z.object({
  goal: z.enum(creatorGoals).nullable(),
  goal_details: z.string().max(500),
  filming_minutes: z.number().int().min(5).max(480).nullable(),
  style_notes: z.string().max(500),
  audience_notes: z.string().max(500),
  topics_to_avoid: z.array(z.string().min(1).max(100)).max(10),
});
export type CreatorPreferences = z.infer<typeof creatorPreferencesSchema>;
export const emptyCreatorPreferences = (): CreatorPreferences => ({
  goal: null,
  goal_details: "",
  filming_minutes: null,
  style_notes: "",
  audience_notes: "",
  topics_to_avoid: [],
});
const preferencesResponseSchema = z.object({
  preferences: creatorPreferencesSchema,
  updated_at: z.string().nullable(),
});
const memoryObservationSchema = z.object({
  label: z.string(),
  source_ids: z.array(z.string()),
});
const channelMemorySchema = z.object({
  summary: z.string(),
  themes: z.array(memoryObservationSchema),
  style: z.array(memoryObservationSchema),
  covered_topics: z.array(memoryObservationSchema),
  sources: z.array(sourceSchema),
  generated_at: z.string(),
  is_stale: z.boolean(),
});
export type ChannelMemory = z.infer<typeof channelMemorySchema>;
export const channelContextSchema = z.object({
  creator: z.object({
    display_name: z.string(),
    account_type: z.string().nullable(),
    niche: z.string().nullable(),
  }),
  target_platform: ideaTargetSchema.nullable(),
  accounts: z.array(
    z.object({
      platform: z.string(),
      followers: z.number().nullable(),
      typical_views: z.number().nullable(),
      audience: z.record(z.string(), z.unknown()),
      refreshed_at: z.string().nullable(),
    }),
  ),
  sources: z.array(sourceSchema),
  published_posts: z.number(),
  draft_reviews: z.number(),
  distinct_content: z.number(),
  history_status: z.enum(["insufficient", "limited", "available"]),
  can_generate: z.boolean(),
  last_updated: z.string().nullable(),
  collected_at: z.string(),
  warnings: z.array(z.string()),
  creator_preferences: creatorPreferencesSchema.default(
    emptyCreatorPreferences,
  ),
  preferences_updated_at: z.string().nullable().default(null),
  memory: channelMemorySchema.nullable().default(null),
  trend_research: trendResearchSchema.nullable().default(null),
});
export type ChannelContext = z.infer<typeof channelContextSchema>;
export const contentIdeaSchema = z.object({
  id: z.string(),
  batch_id: z.string(),
  title: z.string(),
  hook: z.string(),
  outline: z.array(z.string()),
  platform: ideaTargetSchema,
  approach: z.string(),
  rationale: z.string(),
  sources: z.array(sourceSchema),
  channel_summary: z.string(),
  context_warnings: z.array(z.string()),
  status: z.enum(["suggested", "saved", "dismissed"]),
  created_at: z.string(),
  creator_preferences: creatorPreferencesSchema.default(
    emptyCreatorPreferences,
  ),
  memory_generated_at: z.string().nullable().default(null),
  idea_kind: ideaKindSchema.nullable().default(null),
  trend_sources: z.array(trendEvidenceSchema).default([]),
  trend_research: trendResearchSchema.nullable().default(null),
  feedback: z.enum(["useful", "not_useful"]).nullable().default(null),
  adaptations: z
    .array(
      z.object({
        platform: ideaPlatformSchema,
        format: z.string().min(3).max(80),
        hook: z.string().min(5).max(180),
        execution: z.string().min(10).max(300),
      }),
    )
    .max(5)
    .default([]),
});
export type ContentIdea = z.infer<typeof contentIdeaSchema>;
const generatedSchema = z.object({
  context: channelContextSchema,
  ideas: z.array(contentIdeaSchema),
});

async function request(
  path: string,
  signal: AbortSignal,
  body?: unknown,
  method?: string,
): Promise<unknown> {
  const response = await fetch(`${API_BASE}/ideas${path}`, {
    signal,
    credentials: "include",
    cache: "no-store",
    method: method ?? (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      typeof payload?.detail === "string"
        ? payload.detail
        : `Ideas service returned ${response.status}. Please try again.`,
    );
  }
  return response.json();
}

export const ideasApi = {
  async preferences(signal: AbortSignal) {
    return preferencesResponseSchema.parse(
      await request("/preferences", signal),
    );
  },
  async savePreferences(preferences: CreatorPreferences, signal: AbortSignal) {
    return preferencesResponseSchema.parse(
      await request(
        "/preferences",
        signal,
        creatorPreferencesSchema.parse(preferences),
        "PUT",
      ),
    );
  },
  async refreshMemory(signal: AbortSignal) {
    return channelContextSchema.parse(
      await request("/memory/refresh", signal, {}),
    );
  },
  async context(platform: IdeaTarget | null, signal: AbortSignal) {
    return channelContextSchema.parse(
      await request(
        `/context${platform ? `?platform=${platform}` : ""}`,
        signal,
      ),
    );
  },
  async list(platform: IdeaTarget | null, saved: boolean, signal: AbortSignal) {
    const query = new URLSearchParams();
    if (platform) query.set("platform", platform);
    if (saved) query.set("status", "saved");
    return z.array(contentIdeaSchema).parse(await request(`?${query}`, signal));
  },
  async generate(
    platform: IdeaTarget | null,
    count: number,
    signal: AbortSignal,
    trends?: TrendOptions,
  ) {
    return generatedSchema.parse(
      await request("/generate", signal, { platform, count, ...trends }),
    );
  },
  async status(id: string, status: ContentIdea["status"], signal: AbortSignal) {
    return contentIdeaSchema.parse(
      await request(`/${encodeURIComponent(id)}`, signal, { status }, "PATCH"),
    );
  },
  async feedback(
    id: string,
    feedback: ContentIdea["feedback"],
    signal: AbortSignal,
  ) {
    return contentIdeaSchema.parse(
      await request(
        `/${encodeURIComponent(id)}/feedback`,
        signal,
        { feedback },
        "PATCH",
      ),
    );
  },
};

export function trendLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !/[\u0000-\u0020\\]/.test(value)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function sourceLink(source: IdeaSource): string | null {
  const url = source.url ?? "";
  return /^\/analysis\/[a-f0-9]{32}$/.test(url) ||
    /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(url)
    ? url
    : null;
}

export function localDate(value: string | null): string {
  if (!value) return "Unknown";
  const normalized = value.replace(" ", "T");
  const date = new Date(
    /[Zz]$|[+-]\d\d:\d\d$/.test(normalized) ? normalized : normalized + "Z",
  );
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString()
    : "Unknown";
}
