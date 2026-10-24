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
}

export interface PredictRequest {
  user_id?: string;
  caption: string;
  platforms?: Platform[];
  format?: string;
  planned_time?: string; // ISO datetime
  thumbnail_url?: string;
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
}

export interface PlatformScore {
  platform: Platform;
  score: number; // 0-100 virality percentile within the platform
  top_factors: { feature: string; impact: number }[];
  vs_account: AccountComparison | null;
}

export interface PredictResponse {
  scores: PlatformScore[];
  suggestions: string[];
}

export interface CombinedScore {
  platform: Platform;
  score: number; // combined: model_weight * model_score + (1 - model_weight) * content_score
  model_score: number;
  content_score: number | null; // null when Gemini wasn't used
  top_factors: { feature: string; impact: number }[];
  vs_account: AccountComparison | null;
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
}

export interface ScoreInput {
  caption: string;
  platforms: Platform[];
  plannedTime?: string; // ISO datetime
  context?: Record<string, string | number | boolean>; // e.g. { followers: 5000 }
  file?: File | null; // image or video
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
  dashboard: (userId: string) => request<DashboardResponse>(`/dashboard/${userId}`),

  predict: (body: PredictRequest) =>
    request<PredictResponse>("/predict", { method: "POST", body: JSON.stringify(body) }),

  ingestYouTube: (userId: string, channelId: string) =>
    request<{ posts_loaded: number }>("/ingest/youtube", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, channel_id: channelId }),
    }),

  ingestCsv: (userId: string, platform: Platform, file: File) => {
    const form = new FormData();
    form.append("user_id", userId);
    form.append("platform", platform);
    form.append("file", file);
    return request<{ posts_loaded: number }>("/ingest/csv", { method: "POST", body: form });
  },

  // Our model + Gemini content review (multipart, so the draft's image/video can be attached)
  score: ({ caption, platforms, plannedTime, context, file }: ScoreInput) => {
    const form = new FormData();
    form.append("caption", caption);
    form.append("platforms", platforms.join(","));
    if (plannedTime) form.append("planned_time", plannedTime);
    form.append("context", JSON.stringify(context ?? {}));
    if (file) form.append("file", file);
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
