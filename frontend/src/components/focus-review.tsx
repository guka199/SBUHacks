"use client";

import { Play } from "lucide-react";
import type { FocusAnalysis } from "@/lib/contracts";
import { timecode } from "@/lib/video";

const COPY = {
  clarity: {
    title: "Your clarity, under the lens.",
    rating: "Clarity rating",
    fix: "Biggest clarity fix",
  },
  pacing: {
    title: "Your pacing, under the lens.",
    rating: "Pacing rating",
    fix: "Biggest pacing fix",
  },
};

/** Whole-video clarity or pacing review, laid out like the opening review. */
export function FocusReview({
  kind,
  review,
  playable,
  reviewed,
  onPlay,
}: {
  kind: "clarity" | "pacing";
  review: FocusAnalysis | null | undefined;
  playable: boolean;
  reviewed: boolean;
  onPlay: (start: number, end: number, id: string) => void;
}) {
  const copy = COPY[kind];
  const titleId = `${kind}-review-title`;
  if (!review)
    return (
      <section
        className="hook-review hook-unavailable"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{copy.title}</h2>
        <p>
          {reviewed
            ? `This report has no ${kind} review. Analyze the video again to get one.`
            : `The ${kind} review needs a video content review. Your statistical scores are still available.`}
        </p>
      </section>
    );

  return (
    <section className="hook-review" aria-labelledby={titleId}>
      <div className="panel-heading">
        <h2 id={titleId}>{copy.title}</h2>
        <span>Whole video · AI assessment</span>
      </div>
      <div className="hook-intro">
        <div
          className="hook-rating"
          aria-label={
            review.score === null
              ? `${copy.rating} unavailable`
              : `${copy.rating} ${review.score} out of 100`
          }
        >
          <strong>
            {review.score === null ? "—" : Math.round(review.score)}
          </strong>
          <span>/ 100</span>
          <small>{copy.rating}</small>
        </div>
        <div>
          <p className="hook-summary">{review.summary}</p>
          <p className="focus-fix">
            <strong>{copy.fix}:</strong> {review.topFix}
          </p>
        </div>
      </div>
      <div className="hook-criteria">
        {review.criteria.map((criterion) => (
          <article key={criterion.id}>
            <div>
              <h3>{criterion.label}</h3>
              <strong>
                {criterion.score === null
                  ? "Not assessed"
                  : `${Math.round(criterion.score)}/100`}
              </strong>
            </div>
            <p>{criterion.evidence}</p>
          </article>
        ))}
      </div>
      {review.evidence.length > 0 && (
        <div className="hook-evidence">
          <h3>Where it shows</h3>
          <ul>
            {review.evidence.map((item, index) => (
              <li key={`${item.start}-${item.end}`}>
                <button
                  type="button"
                  className="clip-play"
                  disabled={!playable}
                  aria-label={`Play ${kind} moment ${index + 1}: ${timecode(item.start)} to ${timecode(item.end)}`}
                  onClick={() =>
                    onPlay(item.start, item.end, `${kind}-evidence-${index}`)
                  }
                >
                  <Play size={12} /> {timecode(item.start)}–{timecode(item.end)}
                </button>
                <div>
                  <p>{item.observation}</p>
                  <p>
                    <strong>Try:</strong> {item.edit}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="hook-method">
        The rating averages the assessed criteria. An AI editorial review, not
        measured viewer retention or a prediction of views.
      </p>
    </section>
  );
}
