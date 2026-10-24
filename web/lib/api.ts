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
}

export interface PlatformScore {
  platform: Platform;
  score: number; // 0-100 virality percentile within the platform
  top_factors: { feature: string; impact: number }[];
}

export interface PredictResponse {
  scores: PlatformScore[];
  suggestions: string[];
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

  briefing: (userId: string) =>
    request<AudioResponse>("/voice/briefing", { method: "POST", body: JSON.stringify({ user_id: userId }) }),

  contribute: (userId: string, walletAddress: string, postsShared: number) =>
    request<ContributeResponse>("/contribute", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, wallet_address: walletAddress, posts_shared: postsShared }),
    }),

  audioUrl: (path: string) => `${API_URL}${path}`,
};
