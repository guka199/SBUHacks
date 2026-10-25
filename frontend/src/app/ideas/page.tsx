"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Lightbulb,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CopyButton } from "@/components/ui";
import {
  ideasApi,
  ideaPlatforms,
  localDate,
  platformNames,
  sourceLink,
  type ChannelContext,
  type ContentIdea,
  type IdeaPlatform,
  type IdeaSource,
} from "@/lib/ideas";
import styles from "./ideas.module.css";

function Evidence({ source }: { source: IdeaSource }) {
  const href = sourceLink(source);
  return (
    <article className={styles.source}>
      <span className={styles.eyebrow}>
        {source.kind === "published_post"
          ? "Published post"
          : "Unpublished draft"}{" "}
        · {platformNames[source.platform] ?? source.platform}
      </span>
      {href ? (
        <a
          href={href}
          target={href.startsWith("https:") ? "_blank" : undefined}
          rel="noopener noreferrer"
        >
          {source.title} <ArrowUpRight size={14} />
        </a>
      ) : (
        <strong>{source.title}</strong>
      )}
      {source.kind === "published_post" ? (
        <>
          <p>
            {source.views == null
              ? "Views unknown"
              : `${source.views.toLocaleString()} lifetime views`}
            {source.age_days != null &&
              ` · ${Math.floor(source.age_days)} days old`}
          </p>
          {source.relative_views != null && (
            <p>
              {source.relative_views}× the median of {source.comparison_count}{" "}
              same-platform, same-format posts ({source.comparison_label}).
            </p>
          )}
          <small>Statistics snapshot: {localDate(source.updated_at)}</small>
        </>
      ) : (
        <>
          <p>{source.summary}</p>
          <small>
            {source.review_kind === "gemini"
              ? "Gemini content review"
              : "Model-only review"}{" "}
            · {localDate(source.updated_at)} · Not a published result
          </small>
        </>
      )}
    </article>
  );
}

export default function IdeasPage() {
  const { user, loading } = useAuth();
  const [platform, setPlatform] = useState<IdeaPlatform | "all">("all");
  const [count, setCount] = useState(3);
  const [savedOnly, setSavedOnly] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<{
    key: string;
    context: ChannelContext;
    ideas: ContentIdea[];
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const key = `${user?.id}:${platform}:${savedOnly}`;
  const current = data?.key === key ? data : null;
  const error = failure?.key === key ? failure.message : "";

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const chosen = platform === "all" ? null : platform;
    Promise.all([
      ideasApi.context(chosen, controller.signal),
      ideasApi.list(chosen, savedOnly, controller.signal),
    ])
      .then(([context, ideas]) => {
        if (!controller.signal.aborted) {
          setData({ key, context, ideas });
          setFailure(null);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setFailure({
            key,
            message:
              error instanceof Error
                ? error.message
                : "Could not load your ideas",
          });
      });
    return () => controller.abort();
  }, [user, key, platform, savedOnly, refresh]);
  useEffect(() => () => active.current?.abort(), []);

  async function generate() {
    if (busy || actionId || !current?.context.can_generate) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setNotice("");
    setFailure(null);
    try {
      const result = await ideasApi.generate(
        platform === "all" ? null : platform,
        count,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const nextKey = `${user?.id}:${platform}:false`;
      setSavedOnly(false);
      setData({
        key: nextKey,
        context: result.context,
        ideas: [...result.ideas, ...(current?.ideas ?? [])].slice(0, 50),
      });
      setNotice(
        `${result.ideas.length} ideas generated and stored in your account.`,
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setFailure({
          key,
          message:
            error instanceof Error ? error.message : "Could not generate ideas",
        });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function update(idea: ContentIdea, status: ContentIdea["status"]) {
    if (busy || actionId) return;
    const controller = new AbortController();
    active.current = controller;
    setActionId(idea.id);
    setFailure(null);
    setNotice("");
    try {
      const updated = await ideasApi.status(idea.id, status, controller.signal);
      if (controller.signal.aborted) return;
      setData((previous) =>
        previous
          ? {
              ...previous,
              ideas: previous.ideas
                .map((item) => (item.id === updated.id ? updated : item))
                .filter(
                  (item) =>
                    item.status !== "dismissed" &&
                    (!savedOnly || item.status === "saved"),
                ),
            }
          : null,
      );
      setNotice(
        status === "saved"
          ? "Idea saved for later."
          : status === "dismissed"
            ? "Idea dismissed."
            : "Idea removed from saved.",
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setFailure({
          key,
          message:
            error instanceof Error ? error.message : "Could not update idea",
        });
    } finally {
      if (!controller.signal.aborted) setActionId("");
    }
  }

  return (
    <div className={`page-gutter ${styles.page}`}>
      <header className={styles.heading}>
        <span className={styles.eyebrow}>
          <Lightbulb size={16} /> Your next chapter
        </span>
        <h1>What comes next?</h1>
        <p>
          Follow-up ideas shaped by your channel, previous posts, and saved
          video reviews.
        </p>
      </header>
      {loading ? (
        <p role="status">Opening your account…</p>
      ) : !user ? (
        <section className={styles.empty}>
          <h2>Make it personal.</h2>
          <p>Sign in to build ideas from your own content history.</p>
          <div className="button-row">
            <Link href="/login?next=/ideas" className="button button-accent">
              Sign in
            </Link>
            <Link href="/signup?next=/ideas" className="button button-outline">
              Create an account
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section
            className={styles.controls}
            aria-label="Idea generation controls"
          >
            <label>
              Target platform
              <select
                value={platform}
                disabled={busy || !!actionId}
                onChange={(event) => {
                  setPlatform(event.target.value as IdeaPlatform | "all");
                  setNotice("");
                }}
              >
                <option value="all">Explore platforms</option>
                {ideaPlatforms.map((id) => (
                  <option key={id} value={id}>
                    {platformNames[id]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              How many ideas?
              <select
                value={count}
                disabled={busy || !!actionId}
                onChange={(event) => setCount(Number(event.target.value))}
              >
                {[3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} ideas
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-accent"
              onClick={generate}
              disabled={busy || !!actionId || !current?.context.can_generate}
            >
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <Lightbulb size={18} />
              )}
              {busy ? "Finding your next ideas…" : "Generate ideas"}
            </button>
            <button
              className="text-link"
              disabled={busy || !!actionId}
              onClick={() => {
                setFailure(null);
                setRefresh((value) => value + 1);
              }}
            >
              <RefreshCw size={15} /> Refresh context
            </button>
          </section>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className={styles.notice} role="status">
              <Check size={16} />
              {notice}
            </p>
          )}
          {busy && (
            <p className={styles.subtle} role="status">
              Using saved text and reviews. Your videos are not being uploaded
              again. Leaving this page may not stop accepted generation.
            </p>
          )}
          {!current && !error ? (
            <p role="status">Loading your channel history…</p>
          ) : (
            current && (
              <>
                <section
                  className={styles.context}
                  aria-label="Channel context"
                >
                  <div>
                    <span className={styles.eyebrow}>
                      Built from your history
                    </span>
                    <h2>
                      {current.context.creator.niche ||
                        current.context.creator.display_name ||
                        "Your channel"}
                    </h2>
                    <p>
                      {current.context.published_posts} published posts ·{" "}
                      {current.context.draft_reviews} draft reviews ·{" "}
                      {current.context.accounts.length} linked accounts
                    </p>
                    <small>
                      Latest stored context:{" "}
                      {localDate(current.context.last_updated)}. Refresh account
                      statistics on <Link href="/accounts">Accounts</Link>.
                    </small>
                  </div>
                  <details className={styles.contextDetails}>
                    <summary>See sources and limitations</summary>
                    <ul>
                      {current.context.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                    <div className={styles.sourceGrid}>
                      {current.context.sources.map((source) => (
                        <Evidence key={source.id} source={source} />
                      ))}
                    </div>
                  </details>
                </section>
                {!current.context.can_generate && (
                  <section className={styles.empty}>
                    <h2>Give your next idea a starting point.</h2>
                    <p>
                      Connect a channel with recent posts, or analyze at least
                      two videos with different captions. We need some content
                      history to make useful follow-ups.
                    </p>
                    <div className="button-row">
                      <Link href="/accounts" className="button button-light">
                        Connect a channel
                      </Link>
                      <Link href="/analyze" className="button button-outline">
                        Analyze a video
                      </Link>
                    </div>
                  </section>
                )}
                <div
                  className={styles.tabs}
                  role="group"
                  aria-label="Idea list filter"
                >
                  <button
                    disabled={busy || !!actionId}
                    aria-pressed={!savedOnly}
                    onClick={() => setSavedOnly(false)}
                  >
                    All ideas
                  </button>
                  <button
                    disabled={busy || !!actionId}
                    aria-pressed={savedOnly}
                    onClick={() => setSavedOnly(true)}
                  >
                    <Bookmark size={15} /> Saved for later
                  </button>
                </div>
                {!current.ideas.length ? (
                  <p className={styles.subtle}>
                    {savedOnly
                      ? "No saved ideas yet. Save an idea to keep it here."
                      : current.context.can_generate
                        ? "Your history is ready. Generate your first follow-up ideas."
                        : "Your ideas will appear here once you have enough context."}
                  </p>
                ) : (
                  <div className={styles.grid}>
                    {current.ideas.map((idea) => (
                      <article key={idea.id} className={styles.card}>
                        <div className={styles.cardTop}>
                          <span className={styles.badge}>
                            {platformNames[idea.platform]}
                          </span>
                          <span className={styles.eyebrow}>
                            {idea.approach.replace("_", " ")}
                          </span>
                          <CopyButton
                            text={`${idea.title}\n\n${idea.hook}\n\n${idea.outline.map((line, index) => `${index + 1}. ${line}`).join("\n")}`}
                            label="Copy content idea"
                          />
                        </div>
                        <h2>{idea.title}</h2>
                        <blockquote>{idea.hook}</blockquote>
                        <ol>
                          {idea.outline.map((beat, index) => (
                            <li key={index}>{beat}</li>
                          ))}
                        </ol>
                        <section className={styles.rationale}>
                          <h3>Why it fits your channel</h3>
                          <p>{idea.rationale}</p>
                        </section>
                        <details className={styles.evidence}>
                          <summary>
                            Inspired by {idea.sources.length} of your posts /
                            reviews
                          </summary>
                          <p>{idea.channel_summary}</p>
                          {idea.sources.map((source) => (
                            <Evidence key={source.id} source={source} />
                          ))}
                          <ul>
                            {idea.context_warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </details>
                        <footer>
                          <span>{localDate(idea.created_at)}</span>
                          <button
                            className="text-link"
                            disabled={busy || !!actionId}
                            onClick={() =>
                              update(
                                idea,
                                idea.status === "saved" ? "suggested" : "saved",
                              )
                            }
                          >
                            {actionId === idea.id ? (
                              <Loader2 className="spin" size={16} />
                            ) : (
                              <Bookmark
                                size={16}
                                fill={
                                  idea.status === "saved"
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                            )}
                            {idea.status === "saved" ? "Saved" : "Save idea"}
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Dismiss ${idea.title}`}
                            title="Dismiss idea"
                            disabled={busy || !!actionId}
                            onClick={() => update(idea, "dismissed")}
                          >
                            <X size={16} />
                          </button>
                        </footer>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )
          )}
          <p className={styles.disclaimer}>
            AI-generated creative suggestions. Source statistics describe
            previous posts and do not guarantee future results.
          </p>
        </>
      )}
    </div>
  );
}
