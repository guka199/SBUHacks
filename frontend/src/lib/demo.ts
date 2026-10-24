import {
  type AnalysisResult,
  type PlatformId,
  type Suggestions,
  type VideoMetadata,
  platforms,
} from "./contracts";

export function makeSuggestions(
  platform: PlatformId,
  tone: "direct" | "playful" | "educational" = "direct",
): Suggestions {
  const short = platform !== "youtube";
  return {
    hook:
      tone === "playful"
        ? "Your next good idea is hiding in plain sight."
        : tone === "educational"
          ? "Here are three ways to turn an ordinary moment into a story."
          : "You don't need a perfect idea. You need to start.",
    title: short
      ? "Make something before you feel ready"
      : "From a small idea to a story worth sharing: a creator's process",
    caption:
      platform === "instagram"
        ? "A reminder to make the thing. Save this for your next creative block. #CreativeProcess #MakeSomething"
        : "Less overthinking. More making. What will you start today? #CreateEveryDay",
    description:
      "A little experiment in noticing more, trying things, and making something your own. Start with one moment and see where it takes you.",
    cta:
      platform === "instagram"
        ? "Save this for your next creative block."
        : platform === "youtube"
          ? "Tell me which part of the process you want to see next."
          : "What would you make? Tell me below.",
    edits: short
      ? [
          "Open on the finished result, then show the process.",
          "Trim the pause before the first cut.",
          "Add readable captions inside the safe area.",
        ]
      : [
          "Expand the process with a concrete before-and-after example.",
          "Add chapters for each creative decision.",
          "Resolve the opening promise before the end screen.",
        ],
  };
}

// Authored fixtures: these values are never calculated from the selected video.
export function makeDemoResult(
  metadata?: VideoMetadata,
  selected: PlatformId[] = platforms.map((p) => p.id),
): AnalysisResult {
  const video = metadata ?? {
    name: "Make something.mp4",
    durationSeconds: 24,
    width: 1080,
    height: 1920,
  };
  const values: Record<PlatformId, [number, number, number, number]> = {
    tiktok: [86, 91, 78, 94],
    instagram: [82, 85, 76, 92],
    shorts: [89, 93, 85, 94],
    youtube: [61, 78, 59, 48],
  };
  const descriptions: Record<PlatformId, string> = {
    tiktok: "A strong opening. Tighten the middle to keep the momentum.",
    instagram: "A save-worthy concept. Give the viewer a clear takeaway.",
    shorts:
      "Your strongest fit in this example. One idea, a satisfying payoff.",
    youtube: "This idea needs more depth for a long-form story.",
  };
  const duration = video.durationSeconds;
  return {
    id: "demo",
    mode: "demo",
    video,
    summary:
      "Lead with the payoff. Bring your strongest frame forward, then give every cut a reason to stay.",
    platforms: selected.map((id) => ({
      id,
      score: values[id][0],
      hook: values[id][1],
      pacing: values[id][2],
      format: values[id][3],
      assessment: descriptions[id],
      opportunities: makeSuggestions(id).edits,
      suggestions: makeSuggestions(id),
    })),
    observations: [
      {
        id: "opening",
        time: 0,
        end: duration * 0.12,
        kind: "strength",
        title: "An opening with a point of view",
        detail:
          "Example observation: the first frame creates a clear visual question. Keep the payoff in view.",
      },
      {
        id: "pace",
        time: duration * 0.33,
        end: duration * 0.46,
        kind: "opportunity",
        title: "Make this beat move faster",
        detail:
          "Example observation: this is where a shorter pause or a tighter cut could restore momentum.",
      },
      {
        id: "payoff",
        time: duration * 0.67,
        end: duration * 0.82,
        kind: "strength",
        title: "Give the payoff a little space",
        detail:
          "Example observation: let the finished result land before moving into your closing line.",
      },
      {
        id: "close",
        time: duration * 0.9,
        end: duration,
        kind: "opportunity",
        title: "Leave a reason to respond",
        detail:
          "Example observation: end with one specific question instead of a general request to engage.",
      },
    ],
  };
}
