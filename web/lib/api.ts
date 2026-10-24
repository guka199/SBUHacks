// Typed client for the FastAPI backend. Keep these types in sync with api/schemas.py.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Platform = "youtube" | "tiktok" | "instagram" | "linkedin";

export interface PlatformStats {
  platform: Platform;
  posts: number;
  avg_engagement_rate: number;
  total_views: number;
}

export interface DashboardResponse {
  user_id: string;
  platforms: PlatformStats[];
  by_format: (PlatformStats & { format: string })[];
  weekly: (PlatformStats & { week: string })[];
  recent_posts: RecentPost[];
  accounts: { platform: Platform; handle: string | null; followers: number | null }[];
  total_posts: number;
  last_import_at: string | null;
}

export interface RecentPost {
  platform: Platform;
  external_id: string | null;
  format: string | null;
  caption: string;
  posted_at: string | null;
  thumbnail_url: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number | null;
  sentiment: string | null;
}

export interface IngestResponse {
  posts_loaded: number;
  inserted: number;
  updated: number;
  duplicates_skipped: number;
  batch_id: string | null;
  enriched_posts: number;
  warnings: string[];
}

export interface InsightsResponse {
  user_id: string;
  summary: string;
  provider: "snowflake-cortex";
  model: string;
}

export interface PredictionHistory {
  predictions: {
    id: string;
    request_id: string | null;
    platform: Platform;
    caption: string;
    score: number;
    model_score: number | null;
    content_score: number | null;
    provider: string | null;
    created_at: string;
  }[];
}

export interface DataStatus {
  snowflake_configured: boolean;
  youtube_configured: boolean;
  missing_settings: string[];
  connection_checked: boolean;
}

export interface PredictRequest {
  user_id?: string;
  caption: string;
  platforms?: Platform[];
  format?: string;
  planned_time?: string; // ISO datetime
  thumbnail_url?: string;
  use_thumbnail_model?: boolean;
  // Optional context about the draft / account
  followers?: number;
  following?: number;
  num_posts?: number;
  duration_sec?: number;
  original_sound?: boolean;
  verified?: boolean;
  is_business_account?: boolean;
  category?: string;
  description_length?: number;
  creator_typical_views?: number; // TikTok: views a typical post of this account gets
}

export interface AccountComparison {
  ratio: number; // expected result / the account's typical post
  percent: number; // (ratio - 1) * 100
  reliability: "low" | "moderate" | "high";
  expected_views: number | null;
  thumbnail_used: boolean;
}

export interface PlatformScore {
  platform: Platform;
  score: number; // 0-100 virality percentile within the platform
  top_factors: { feature: string; impact: number }[];
  vs_account: AccountComparison | null;
  thumbnail_used: boolean;
}

export interface PredictResponse {
  scores: PlatformScore[];
  suggestions: string[];
  prediction_id: string | null;
  storage_warning: string | null;
  thumbnail_warning: string | null;
}

export interface CombinedScore {
  platform: Platform;
  score: number; // combined: model_weight * model_score + (1 - model_weight) * content_score
  model_score: number;
  content_score: number | null; // null when Gemini wasn't used
  top_factors: { feature: string; impact: number }[];
  vs_account: AccountComparison | null;
  thumbnail_used: boolean;
}

export interface ContentAnalysis {
  summary: string;
  hook: number;
  visual_quality: number;
  clarity: number;
  trend_fit: number;
  platform_scores: { platform: Platform; score: number; reason: string }[];
  strengths: string[];
}

export interface ScoreResponse {
  scores: CombinedScore[];
  suggestions: string[];
  content: ContentAnalysis | null;
  model_weight: number;
  gemini_used: boolean;
  warning: string | null;
  prediction_id: string | null;
  storage_warning: string | null;
  thumbnail_warning: string | null;
}

export interface ScoreInput {
  userId?: string; // Temporary demo identity until wallet authentication is implemented.
  caption: string;
  platforms: Platform[];
  plannedTime?: string; // ISO datetime
  context?: Record<string, string | number | boolean>; // e.g. { followers: 5000 }
  file?: File | null; // image or video
  thumbnail?: File | null; // Optional selected YouTube thumbnail, separate from the video
  useThumbnailModel?: boolean; // Explicit experimental opt-in; standard scoring is the default
}

export interface AudioResponse {
  audio_urls: string[];
}

export interface ContributeResponse {
  contribution_id: string;
  tokens_owed: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: (userId: string, days?: number) =>
    request<DashboardResponse>(`/dashboard/${encodeURIComponent(userId)}${days ? `?days=${days}` : ""}`),

  dataStatus: () => request<DataStatus>("/data/status"),

  enrich: (userId: string, limit = 25) => request<{ enriched_posts: number }>("/data/enrich", {
    method: "POST", body: JSON.stringify({ user_id: userId, limit }),
  }),

  insights: (userId: string, days = 30) => request<InsightsResponse>(`/dashboard/${encodeURIComponent(userId)}/insights?days=${days}`, {
    method: "POST",
  }),

  similarPosts: (userId: string, caption: string, platform?: Platform) =>
    request<{ posts: (RecentPost & { similarity: number })[] }>(`/data/${encodeURIComponent(userId)}/similar`, {
      method: "POST", body: JSON.stringify({ caption, platform }),
    }),

  predictionHistory: (userId: string) => request<PredictionHistory>(`/dashboard/${encodeURIComponent(userId)}/predictions`),

  predict: (body: PredictRequest) =>
    request<PredictResponse>("/predict", { method: "POST", body: JSON.stringify(body) }),

  ingestYouTube: (userId: string, channelId: string, maxVideos = 50) =>
    request<IngestResponse>("/ingest/youtube", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, channel_id: channelId, max_videos: maxVideos }),
    }),

  ingestCsv: (userId: string, platform: Platform | null, file: File) => {
    const form = new FormData();
    form.append("user_id", userId);
    if (platform) form.append("platform", platform);
    form.append("file", file);
    return request<IngestResponse>("/ingest/csv", { method: "POST", body: form });
  },

  // Our model + Gemini content review (multipart, so the draft's image/video can be attached)
  score: ({ userId = "demo", caption, platforms, plannedTime, context, file, thumbnail, useThumbnailModel = false }: ScoreInput) => {
    const form = new FormData();
    form.append("caption", caption);
    form.append("user_id", userId);
    form.append("use_thumbnail_model", String(useThumbnailModel));
    form.append("platforms", platforms.join(","));
    if (plannedTime) form.append("planned_time", plannedTime);
    form.append("context", JSON.stringify(context ?? {}));
    if (file) form.append("file", file);
    if (thumbnail) form.append("thumbnail", thumbnail);
    return request<ScoreResponse>("/score", { method: "POST", body: form });
  },

  briefing: (userId: string) =>
    request<AudioResponse>("/voice/briefing", { method: "POST", body: JSON.stringify({ user_id: userId }) }),

  contribute: (userId: string, walletAddress: string, postsShared: number) =>
    request<ContributeResponse>("/contribute", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, wallet_address: walletAddress, posts_shared: postsShared }),
    }),

  audioUrl: (path: string) => `${API_URL}${path}`,
};
