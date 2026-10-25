import type { AnalysisResult } from "./contracts";

type Moment = AnalysisResult["observations"][number];
const normalized = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Share of the shorter span covered by both spans (0-1). */
function overlap(
  a: { time: number; end: number },
  b: { time: number; end: number },
) {
  const shared = Math.min(a.end, b.end) - Math.max(a.time, b.time);
  const shorter = Math.max(Math.min(a.end - a.time, b.end - b.time), 0.1);
  return Math.max(shared, 0) / shorter;
}
const clock = (text: string) =>
  [...text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map(
    ([, m, s]) => Number(m) * 60 + Number(s),
  );

// Conservative equivalence: same observation or fix in the same time span.
// Different edits at the same timestamp remain separate findings. The opening
// review's evidence is a second look at the same video, so evidence that mostly
// overlaps an existing finding is folded into it instead of listed again.
export function collectReview(result: AnalysisResult) {
  const moments: Moment[] = [];
  const observations = result.observations.map((o) => ({ ...o }));
  const evidence: Moment[] = (result.hookAnalysis?.evidence ?? [])
    .map((item, index) => ({
      id: `hook-evidence-${index}`,
      time: item.start,
      end: item.end,
      kind: "improve" as const,
      title: "Opening improvement",
      detail: item.observation,
      fix: item.edit,
    }))
    .filter((item) => {
      const covering = observations.find((o) => overlap(o, item) >= 0.5);
      if (covering && !covering.fix && item.fix) covering.fix = item.fix;
      return !covering;
    });
  const candidates: Moment[] = [...observations, ...evidence];
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
  // A whole-video edit that names a time inside a flagged moment repeats that moment's fix.
  const coveredByMoment = (text: string) =>
    clock(text).some((t) =>
      moments.some((m) => t >= m.time - 0.5 && t <= m.end + 0.5),
    );
  const overall = suggestions.filter((text) => {
    const key = normalized(text);
    if (
      !key ||
      seen.has(key) ||
      timestampText.has(key) ||
      coveredByMoment(text)
    )
      return false;
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
