export interface ExperienceMotion {
  progress: number;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  invalidate?: () => void;
}
export const initialMotion = (): ExperienceMotion => ({
  progress: 0,
  x: 1.6,
  y: 2.65,
  z: 6.0,
  targetX: -1.75,
  targetY: 1.85,
  targetZ: -0.77,
});
export const storyStages = [
  { at: 0, name: "The creator desktop", detail: "The problem" },
  { at: 0.24, name: "Meet ViralPilot", detail: "Meet ViralPilot" },
  { at: 0.4, name: "Understand your video", detail: "AI analysis" },
  { at: 0.58, name: "Find your fit", detail: "Platform comparison" },
  { at: 0.76, name: "Sharpen the idea", detail: "Content optimization" },
  { at: 1, name: "Make every post count", detail: "Unified dashboard" },
] as const;
export const notifications = [
  {
    platform: "youtube",
    title: "Audience retention dropped",
    detail: "A new moment to review at 0:08.",
    time: "Just now",
  },
  {
    platform: "instagram",
    title: "Your Reel has new comments",
    detail: "12 conversations are waiting for you.",
    time: "Now",
  },
  {
    platform: "tiktok",
    title: "Your engagement changed",
    detail: "Open your latest video report.",
    time: "Just now",
  },
  {
    platform: "youtube",
    title: "Your latest Short needs a look",
    detail: "The first 3 seconds could work harder.",
    time: "Now",
  },
  {
    platform: "instagram",
    title: "You have unanswered messages",
    detail: "Your audience wants to hear from you.",
    time: "Now",
  },
  {
    platform: "tiktok",
    title: "New analytics report available",
    detail: "Watch time, reach, and more to unpack.",
    time: "Now",
  },
  {
    platform: "youtube",
    title: "Weekly performance is ready",
    detail: "Another report. Another place to check.",
    time: "Now",
  },
  {
    platform: "instagram",
    title: "Reels insights updated",
    detail: "Saves, shares, and the bigger picture.",
    time: "Now",
  },
  {
    platform: "tiktok",
    title: "Check your average watch time",
    detail: "Your audience is telling you something.",
    time: "Now",
  },
  {
    platform: "youtube",
    title: "New creator analytics report",
    detail: "Compare your last five uploads.",
    time: "Now",
  },
  {
    platform: "instagram",
    title: "Your reach is changing",
    detail: "Take a closer look at the last 7 days.",
    time: "Now",
  },
  {
    platform: "tiktok",
    title: "One more thing to review",
    detail: "Your video has new performance insights.",
    time: "Now",
  },
] as const;
export function entryProgress(progress: number) {
  const t = Math.max(0, Math.min(1, (progress - 0.925) / (1 - 0.925)));
  return t * t * (3 - 2 * t);
}
