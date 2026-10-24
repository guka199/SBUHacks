import { API_BASE } from "./api";
export type Platform = "youtube" | "tiktok" | "instagram" | "linkedin";
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : `Request failed (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}
export interface User {
  id: string;
  email: string;
  display_name: string;
  account_type: "creator" | "business" | null;
  niche: string | null;
}

export interface Audience {
  age_range?: string;
  percent_female?: number;
  top_countries?: string[];
  interests?: string;
  language?: string;
}

export interface Account {
  platform: Platform;
  connection: "api" | "manual";
  handle: string | null;
  external_id: string | null;
  display_name: string | null;
  profile_url: string | null;
  followers: number | null;
  following: number | null;
  total_posts: number | null;
  avg_views: number | null;
  typical_views: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_shares: number | null;
  engagement_rate: number | null;
  posts_per_week: number | null;
  audience: Audience;
  extra: Record<string, unknown>;
  updated_at: string | null;
}

export interface ManualAccountInput {
  handle: string;
  profile_url?: string;
  followers?: number;
  following?: number;
  total_posts?: number;
  avg_views?: number;
  avg_likes?: number;
  avg_comments?: number;
  avg_shares?: number;
  posts_per_week?: number;
  audience?: Audience;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const auth = {
  signup: (body: {
    email: string;
    password: string;
    display_name: string;
    account_type: "creator" | "business";
    niche?: string;
  }) => request<User>("/auth/signup", json(body)),
  login: (email: string, password: string) =>
    request<User>("/auth/login", json({ email, password })),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () => request<User | null>("/auth/me"), // null when nobody is signed in
  updateProfile: (body: {
    display_name?: string;
    account_type?: "creator" | "business";
    niche?: string;
  }) =>
    request<User>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>(
      "/auth/password",
      json({ current_password, new_password }),
    ),
  deleteAccount: (password: string) =>
    request<{ ok: boolean }>("/auth/delete-account", json({ password })),
};

export const accounts = {
  list: () => request<Account[]>("/accounts"),
  connectYouTube: (channel: string, audience?: Audience) =>
    request<Account>("/accounts/youtube", json({ channel, audience })),
  saveManual: (platform: Platform, body: ManualAccountInput) =>
    request<Account>(`/accounts/${platform}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  updateAudience: (platform: Platform, audience: Audience) =>
    request<Account>(`/accounts/${platform}/audience`, {
      method: "PATCH",
      body: JSON.stringify(audience),
    }),
  unlink: (platform: Platform) =>
    request<{ ok: boolean }>(`/accounts/${platform}`, { method: "DELETE" }),
};
