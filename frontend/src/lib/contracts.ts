import { z } from "zod";

export const platformIds = [
  "tiktok",
  "instagram",
  "shorts",
  "youtube",
] as const;
export const platformSchema = z.enum(platformIds);
export type PlatformId = z.infer<typeof platformSchema>;
const score = z.number().min(0).max(100);
export const suggestionSchema = z.object({
  hook: z.string(),
  title: z.string(),
  caption: z.string(),
  description: z.string(),
  cta: z.string(),
  edits: z.array(z.string()),
});
export type Suggestions = z.infer<typeof suggestionSchema>;
export const hookAnalysisSchema = z
  .object({
    method: z.literal("ai_review"),
    windowSeconds: z.number().positive().max(5),
    score: score.nullable(),
    summary: z.string().min(1).max(700),
    opening: z.string().min(1).max(700),
    suggestedOpening: z.string().min(1).max(700),
    criteria: z
      .array(
        z.object({
          id: z.enum(["attention", "clarity", "pacing", "audio_text"]),
          label: z.string(),
          score: score.nullable(),
          evidence: z.string().min(1).max(700),
        }),
      )
      .length(4)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === 4,
        "Duplicate hook criteria",
      ),
    evidence: z
      .array(
        z.object({
          start: z.number().nonnegative().lt(5),
          end: z.number().positive().max(5),
          observation: z.string().min(1).max(700),
          edit: z.string().min(1).max(700),
        }),
      )
      .max(3),
  })
  .superRefine((review, ctx) => {
    review.evidence.forEach((item, index) => {
      if (item.end <= item.start || item.end > review.windowSeconds)
        ctx.addIssue({
          code: "custom",
          message: "Evidence outside opening window",
          path: ["evidence", index],
        });
    });
  });
export type HookAnalysis = z.infer<typeof hookAnalysisSchema>;
export const resultSchema = z
  .object({
    id: z.string().min(1),
    mode: z.enum(["demo", "live"]),
    video: z.object({
      name: z.string(),
      durationSeconds: z.number().positive(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    summary: z.string(),
    platforms: z
      .array(
        z.object({
          id: platformSchema,
          score,
          hook: score.nullable(),
          pacing: score.nullable(),
          format: score.nullable(),
          visualQuality: score.nullable().optional(),
          clarity: score.nullable().optional(),
          modelScore: score.optional(),
          contentScore: score.nullable().optional(),
          geminiUsed: z.boolean().optional(),
          modelWeight: z.number().min(0).max(1).optional(),
          strengths: z.array(z.string()).optional(),
          assessment: z.string(),
          opportunities: z.array(z.string()),
          suggestions: suggestionSchema,
        }),
      )
      .min(1)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Duplicate platforms",
      ),
    warnings: z.array(z.string()).optional(),
    observations: z.array(
      z.object({
        id: z.string(),
        time: z.number().nonnegative(),
        end: z.number().nonnegative(),
        kind: z.enum([
          "strength",
          "opportunity",
          "unclear",
          "pacing",
          "improve",
        ]),
        title: z.string(),
        detail: z.string(),
        fix: z.string().optional(),
      }),
    ),
    overallSuggestions: z.array(z.string()).optional(),
    hookAnalysis: hookAnalysisSchema.nullable().optional(),
    thumbnails: z
      .object({
        summary: z.string(),
        items: z.array(
          z.object({
            index: z.number().int().min(0).max(2),
            name: z.string(),
            mimeType: z.string(),
            width: z.number().positive(),
            height: z.number().positive(),
            scores: z.partialRecord(platformSchema, score),
            reasons: z.partialRecord(platformSchema, z.string()),
            strengths: z.array(z.string()),
            improvements: z.array(z.string()),
          }),
        ),
        picks: z.array(
          z.object({
            platform: platformSchema,
            index: z.number().int().min(0).max(2),
            reason: z.string(),
          }),
        ),
      })
      .nullable()
      .optional(),
  })
  .superRefine((result, ctx) => {
    if (
      result.hookAnalysis &&
      result.hookAnalysis.windowSeconds > result.video.durationSeconds
    )
      ctx.addIssue({
        code: "custom",
        message: "Opening window exceeds video",
        path: ["hookAnalysis", "windowSeconds"],
      });
    result.observations.forEach((o, i) => {
      if (o.end < o.time || o.end > result.video.durationSeconds)
        ctx.addIssue({
          code: "custom",
          message: "Observation outside video",
          path: ["observations", i],
        });
    });
  });
export type AnalysisResult = z.infer<typeof resultSchema>;
export type PlatformResult = AnalysisResult["platforms"][number];
export const jobSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["queued", "processing", "complete", "failed"]),
    progress: z.number().min(0).max(100),
    stage: z.string(),
    result: resultSchema.optional(),
    error: z.string().optional(),
  })
  .superRefine((job, ctx) => {
    if (job.status === "complete" && !job.result)
      ctx.addIssue({
        code: "custom",
        message: "Completed job requires result",
      });
  });
export type AnalysisJob = z.infer<typeof jobSchema>;
export interface VideoMetadata {
  name: string;
  durationSeconds: number;
  width: number;
  height: number;
}
export interface RewriteRequest {
  platform: PlatformId;
  tone: "direct" | "playful" | "educational";
}
export const rewriteSchema = z.object({ suggestions: suggestionSchema });
export const platforms: {
  id: PlatformId;
  name: string;
  short: string;
  format: string;
  note: string;
}[] = [
  {
    id: "tiktok",
    name: "TikTok",
    short: "TikTok",
    format: "9:16",
    note: "Lead with the unexpected. Make the first seconds worth staying for.",
  },
  {
    id: "instagram",
    name: "Instagram Reels",
    short: "Reels",
    format: "9:16",
    note: "Make it worth saving. Build a visual story people want to send.",
  },
  {
    id: "shorts",
    name: "YouTube Shorts",
    short: "Shorts",
    format: "9:16",
    note: "One clear idea. A quick payoff. A reason to watch again.",
  },
  {
    id: "youtube",
    name: "YouTube",
    short: "YouTube",
    format: "16:9",
    note: "Give the idea room. Deliver on the promise of your title.",
  },
];
