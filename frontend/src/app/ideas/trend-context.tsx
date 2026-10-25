import { ArrowUpRight, ChevronDown, Globe2 } from "lucide-react";
import {
  ideaKindNames,
  localDate,
  platformNames,
  trendLink,
  trendRegions,
  type ContentIdea,
  type TrendEvidence,
  type TrendResearch,
} from "@/lib/ideas";
import styles from "./ideas.module.css";

export function TrendControls({
  enabled,
  region,
  topic,
  suggestedTopic,
  disabled,
  onEnabled,
  onRegion,
  onTopic,
}: {
  enabled: boolean;
  region: string;
  topic: string;
  suggestedTopic: string;
  disabled: boolean;
  onEnabled: (value: boolean) => void;
  onRegion: (value: string) => void;
  onTopic: (value: string) => void;
}) {
  return (
    <div className={styles.trendControls}>
      <label className={styles.trendToggle}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onEnabled(event.target.checked)}
        />
        <span>
          <strong>Include current trend signals</strong>
          <small>
            Mix timely inspiration with follow-ups and evergreen ideas.
          </small>
        </span>
      </label>
      {enabled && (
        <div className={styles.trendFields}>
          <label>
            Market
            <select
              value={region}
              disabled={disabled}
              onChange={(event) => onRegion(event.target.value)}
            >
              {Object.entries(trendRegions).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Research topic <span className={styles.optional}>Optional</span>
            <input
              value={topic}
              maxLength={100}
              disabled={disabled}
              placeholder={suggestedTopic || "Use my channel’s main topic"}
              onChange={(event) => onTopic(event.target.value)}
            />
          </label>
          <p className={styles.fieldHint}>
            Uses recent public YouTube examples or cited web reports for your
            platform. If no fresh evidence fits, we’ll disclose that and use
            your history. Only a short topic is sent to search—not your videos
            or private reviews.
          </p>
        </div>
      )}
    </div>
  );
}

export function TrendSources({ sources }: { sources: TrendEvidence[] }) {
  return (
    <div className={styles.trendSources}>
      {sources.map((source) => {
        const href = trendLink(source.url);
        return (
          <article className={styles.source} key={source.id}>
            <span className={styles.eyebrow}>
              {platformNames[source.platform]} ·{" "}
              {trendRegions[source.region_code] ?? source.region_code}
            </span>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {source.title} <ArrowUpRight size={14} />
              </a>
            ) : (
              <strong>{source.title}</strong>
            )}
            <p>{source.summary}</p>
            <small>
              {source.date_status === "api_verified"
                ? "Published"
                : "Reported source date"}
              : {localDate(source.published_at)} · Checked:{" "}
              {localDate(source.observed_at)}
            </small>
            {source.views != null && (
              <small>
                {source.views.toLocaleString()} lifetime views at check · Recent
                example, not measured growth
              </small>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function SearchSuggestions({ widgets }: { widgets: string[] }) {
  return (
    <>
      {widgets.map((widget, index) => (
        <iframe
          key={`${index}:${widget.length}`}
          title={`Google Search suggestions ${index + 1}`}
          className={styles.searchSuggestions}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:;"></head><body>${widget}</body></html>`}
        />
      ))}
    </>
  );
}

export function ResearchSummary({
  research,
  viewedAt,
}: {
  research: TrendResearch;
  viewedAt: string;
}) {
  const checked = research.checked_at
    ? new Date(research.checked_at).toLocaleString()
    : null;
  const expired = research.expires_at
    ? new Date(research.expires_at).getTime() <= new Date(viewedAt).getTime()
    : true;
  return (
    <section
      className={styles.researchSummary}
      aria-label="Research used for this batch"
    >
      <div className={styles.researchTitle}>
        <Globe2 size={17} />
        <strong>
          {research.status === "available"
            ? expired
              ? "Saved research snapshot"
              : research.sources.length
                ? "Fresh signals for this batch"
                : "Saved research snapshot"
            : research.status === "disabled"
              ? "Channel history only"
              : "Fresh signals unavailable for this batch"}
        </strong>
      </div>
      <p>
        {research.platform && `${platformNames[research.platform]} · `}
        {trendRegions[research.region_code] ?? research.region_code}
        {research.topic && ` · ${research.topic}`}
        {checked && ` · Checked ${checked}`}
        {research.cached && " · Reused recent research"}
      </p>
      <details>
        <summary>
          Research sources and coverage{" "}
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <ul>
          {research.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        {!!research.sources.length && (
          <TrendSources sources={research.sources} />
        )}
      </details>
      <SearchSuggestions widgets={research.search_suggestions} />
    </section>
  );
}

export function FeedbackSummary({ ideas }: { ideas: ContentIdea[] }) {
  const kinds = Object.keys(ideaKindNames) as (keyof typeof ideaKindNames)[];
  if (!ideas.some((idea) => idea.idea_kind && idea.feedback)) return null;
  return (
    <details className={styles.feedbackSummary}>
      <summary>Compare idea usefulness</summary>
      <p>
        Based only on your ratings for the ideas currently shown. This measures
        usefulness, not post performance.
      </p>
      <div>
        {kinds.map((kind) => {
          const rated = ideas.filter(
            (idea) => idea.idea_kind === kind && idea.feedback,
          );
          const useful = rated.filter(
            (idea) => idea.feedback === "useful",
          ).length;
          return (
            <span key={kind}>
              <strong>{ideaKindNames[kind]}</strong>
              {rated.length
                ? `${useful} of ${rated.length} rated useful`
                : "No ratings yet"}
            </span>
          );
        })}
      </div>
    </details>
  );
}
