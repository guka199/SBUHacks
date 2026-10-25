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
export const platformNames: Record<string, string> = {
  youtube: "YouTube",
  shorts: "YouTube Shorts",
  tiktok: "TikTok",
  instagram: "Instagram Reels",
  linkedin: "LinkedIn",
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
export const channelContextSchema = z.object({
  creator: z.object({
    display_name: z.string(),
    account_type: z.string().nullable(),
    niche: z.string().nullable(),
  }),
  target_platform: ideaPlatformSchema.nullable(),
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
});
export type ChannelContext = z.infer<typeof channelContextSchema>;
export const contentIdeaSchema = z.object({
  id: z.string(),
  batch_id: z.string(),
  title: z.string(),
  hook: z.string(),
  outline: z.array(z.string()),
  platform: ideaPlatformSchema,
  approach: z.string(),
  rationale: z.string(),
  sources: z.array(sourceSchema),
  channel_summary: z.string(),
  context_warnings: z.array(z.string()),
  status: z.enum(["suggested", "saved", "dismissed"]),
  created_at: z.string(),
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
  async context(platform: IdeaPlatform | null, signal: AbortSignal) {
    return channelContextSchema.parse(
      await request(
        `/context${platform ? `?platform=${platform}` : ""}`,
        signal,
      ),
    );
  },
  async list(
    platform: IdeaPlatform | null,
    saved: boolean,
    signal: AbortSignal,
  ) {
    const query = new URLSearchParams();
    if (platform) query.set("platform", platform);
    if (saved) query.set("status", "saved");
    return z.array(contentIdeaSchema).parse(await request(`?${query}`, signal));
  },
  async generate(
    platform: IdeaPlatform | null,
    count: number,
    signal: AbortSignal,
  ) {
    return generatedSchema.parse(
      await request("/generate", signal, { platform, count }),
    );
  },
  async status(id: string, status: ContentIdea["status"], signal: AbortSignal) {
    return contentIdeaSchema.parse(
      await request(`/${encodeURIComponent(id)}`, signal, { status }, "PATCH"),
    );
  },
};

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
