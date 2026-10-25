import type { AnalysisResult } from "./contracts";

type Moment = AnalysisResult["observations"][number];
const normalized = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Conservative equivalence: same observation or fix in the same time span.
// Different edits at the same timestamp remain separate findings.
export function collectReview(result: AnalysisResult) {
  const moments: Moment[] = [];
  const candidates: Moment[] = [
    ...result.observations,
    ...(result.hookAnalysis?.evidence ?? []).map((item, index) => ({
      id: `hook-evidence-${index}`,
      time: item.start,
      end: item.end,
      kind: "improve" as const,
      title: "Opening improvement",
      detail: item.observation,
      fix: item.edit,
    })),
  ];
  for (const item of candidates) {
    const existing = moments.find(
      (other) =>
        other.time === item.time &&
        other.end === item.end &&
        normalized(other.detail) === normalized(item.detail) &&
        (!other.fix ||
          !item.fix ||
          normalized(other.fix) === normalized(item.fix)),
    );
    if (existing) {
      if (!existing.fix && item.fix) existing.fix = item.fix;
    } else moments.push({ ...item });
  }
  moments.sort((a, b) => a.time - b.time || a.end - b.end);
  const timestampText = new Set(
    moments
      .flatMap((item) => [item.detail, item.fix ?? ""])
      .filter(Boolean)
      .map(normalized),
  );
  const seen = new Set<string>([normalized(result.summary)]);
  const suggestions = result.overallSuggestions?.length
    ? result.overallSuggestions
    : result.platforms.flatMap((platform) => platform.opportunities);
  const overall = suggestions.filter((text) => {
    const key = normalized(text);
    if (!key || seen.has(key) || timestampText.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { moments, overall };
}

export function thumbnailLeaders(
  review: NonNullable<AnalysisResult["thumbnails"]>,
) {
  const averages = review.items.map((item) => {
    const scores = Object.values(item.scores).filter(
      (score): score is number => typeof score === "number",
    );
    return {
      index: item.index,
      score: scores.length
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : -1,
    };
  });
  const max = Math.max(...averages.map((item) => item.score));
  return averages
    .filter((item) => item.score >= 0 && Math.abs(item.score - max) < 0.001)
    .map((item) => item.index);
}
