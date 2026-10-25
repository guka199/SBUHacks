"use client";

import { Play } from "lucide-react";
import type { HookAnalysis } from "@/lib/contracts";
import { timecode } from "@/lib/video";
import { CopyButton } from "./ui";

export function HookReview({
  review,
  playable,
  reviewed,
  onPlay,
}: {
  review: HookAnalysis | null | undefined;
  playable: boolean;
  reviewed: boolean;
  onPlay: (start: number, end: number, id: string) => void;
}) {
  if (!review)
    return (
      <section
        className="hook-review hook-unavailable"
        aria-labelledby="hook-review-title"
      >
        <h2 id="hook-review-title">Your opening, under the lens.</h2>
        <p>
          {reviewed
            ? "This report has no focused opening review. Analyze the video again to get feedback on its first five seconds."
            : "Opening feedback needs a video content review. Your statistical scores are still available."}
        </p>
      </section>
    );

  return (
    <section className="hook-review" aria-labelledby="hook-review-title">
      <div className="panel-heading">
        <h2 id="hook-review-title">Your opening, under the lens.</h2>
        <span>0–{review.windowSeconds}s · AI assessment</span>
      </div>
      <div className="hook-intro">
        <div
          className="hook-rating"
          aria-label={
            review.score === null
              ? "Hook rating unavailable"
              : `Hook rating ${review.score} out of 100`
          }
        >
          <strong>
            {review.score === null ? "—" : Math.round(review.score)}
          </strong>
          <span>/ 100</span>
          <small>Opening rating</small>
        </div>
        <div>
          <p className="hook-summary">{review.summary}</p>
          <p className="hook-disclaimer">
            An AI editorial review, not measured viewer retention or a
            prediction of views.
          </p>
          <button
            type="button"
            className="clip-play"
            disabled={!playable}
            onClick={() => onPlay(0, review.windowSeconds, "hook-opening")}
          >
            <Play size={13} /> Watch the opening
          </button>
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
                  : `${criterion.score}/100`}
              </strong>
            </div>
            <p>{criterion.evidence}</p>
          </article>
        ))}
      </div>
      <div className="hook-comparison">
        <div>
          <h3>What opens the video</h3>
          <p>{review.opening}</p>
        </div>
        <div>
          <div className="hook-proposal-heading">
            <h3>Try this opening</h3>
            <CopyButton text={review.suggestedOpening} label="Copy opening" />
          </div>
          <p>{review.suggestedOpening}</p>
          <small>Suggested edit · preview it before publishing.</small>
        </div>
      </div>
      {review.evidence.length > 0 && (
        <div className="hook-evidence">
          <h3>Specific moments to work on</h3>
          <ul>
            {review.evidence.map((item, index) => (
              <li key={`${item.start}-${item.end}`}>
                <button
                  type="button"
                  className="clip-play"
                  disabled={!playable}
                  aria-label={`Play opening evidence ${index + 1}: ${timecode(item.start)} to ${timecode(item.end)}`}
                  onClick={() =>
                    onPlay(item.start, item.end, `hook-evidence-${index}`)
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
        The rating averages the assessed criteria. Unobservable criteria stay
        unscored. This opening review is separate from your platform scores.
      </p>
    </section>
  );
}
