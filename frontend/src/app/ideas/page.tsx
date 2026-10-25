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
  goalNames,
  ideaPlatforms,
  localDate,
  platformNames,
  sourceLink,
  type ChannelContext,
  type ChannelMemory,
  type ContentIdea,
  type CreatorPreferences,
  type IdeaPlatform,
  type IdeaSource,
} from "@/lib/ideas";
import {
  DirectionEditor,
  directionDraft,
  directionIsDirty,
  parseDirection,
  type DirectionDraft,
} from "./direction-editor";
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

function MemoryPanel({
  memory,
  canGenerate,
  disabled,
  refreshing,
  onRefresh,
}: {
  memory: ChannelMemory | null;
  canGenerate: boolean;
  disabled: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className={styles.memory} aria-labelledby="memory-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>
            Summarized from your saved history
          </span>
          <h2 id="memory-heading">Your channel memory</h2>
        </div>
        <button
          className="text-link"
          disabled={disabled || !canGenerate}
          onClick={onRefresh}
        >
          {refreshing ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          {refreshing
            ? "Building memory…"
            : memory
              ? "Refresh memory"
              : "Build memory"}
        </button>
      </div>
      {!memory ? (
        <p className={styles.subtle}>
          {canGenerate
            ? "Generate ideas to build a reusable summary of your themes, style, and topics already covered. You can also build it now."
            : "Add at least two different posts or video reviews to build channel memory."}
        </p>
      ) : (
        <>
          <p className={styles.memorySummary}>{memory.summary}</p>
          <p className={styles.subtle}>
            Built {localDate(memory.generated_at)} · {memory.sources.length}{" "}
            source posts / reviews.
            {memory.is_stale
              ? " Your stored context has changed. Generation will refresh memory first."
              : " Matches the current stored context."}
          </p>
          <div className={styles.memoryColumns}>
            {(
              [
                ["Recurring themes", memory.themes],
                ["Inferred style", memory.style],
                ["Topics already covered", memory.covered_topics],
              ] as const
            ).map(([title, observations]) => (
              <div key={title}>
                <h3>{title}</h3>
                {observations.length ? (
                  <ul>
                    {observations.map((item, index) => (
                      <li key={`${item.label}:${index}`}>
                        {item.label}
                        <span className={styles.sourceRefs}>
                          {item.source_ids
                            .map(
                              (id) =>
                                memory.sources.findIndex(
                                  (source) => source.id === id,
                                ) + 1,
                            )
                            .filter(Boolean)
                            .map((number) => `Source ${number}`)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.subtle}>Not enough evidence yet.</p>
                )}
              </div>
            ))}
          </div>
          <details className={styles.contextDetails}>
            <summary>Inspect memory sources</summary>
            <div className={styles.sourceGrid}>
              {memory.sources.map((source, index) => (
                <div key={source.id}>
                  <span className={styles.sourceRefs}>Source {index + 1}</span>
                  <Evidence source={source} />
                </div>
              ))}
            </div>
          </details>
          <p className={styles.subtle}>
            These are AI inferences from saved captions and reviews. Correct
            style or audience details in your direction above.
          </p>
        </>
      )}
    </section>
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
    revision: number;
    context: ChannelContext;
    ideas: ContentIdea[];
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [operation, setOperation] = useState<
    "generate" | "memory" | "preferences" | null
  >(null);
  const [actionId, setActionId] = useState("");
  const [direction, setDirection] = useState<{
    draft: DirectionDraft;
    saved: CreatorPreferences;
    updatedAt: string | null;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const requestActive = useRef(false);
  const key = `${user?.id}:${platform}:${savedOnly}`;
  const current = data?.key === key ? data : null;
  const error = failure?.key === key ? failure.message : "";
  const isLoadingContext = (!current || current.revision !== refresh) && !error;
  const busy = operation === "generate";
  const working = !!operation || !!actionId;
  const controlsDisabled = working || isLoadingContext;
  const dirty =
    !!direction && directionIsDirty(direction.draft, direction.saved);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    reading.current = controller;
    const chosen = platform === "all" ? null : platform;
    Promise.all([
      ideasApi.context(chosen, controller.signal),
      ideasApi.list(chosen, savedOnly, controller.signal),
    ])
      .then(([context, ideas]) => {
        if (!controller.signal.aborted) {
          setData({ key, revision: refresh, context, ideas });
          setDirection((previous) =>
            previous && directionIsDirty(previous.draft, previous.saved)
              ? previous
              : {
                  draft: directionDraft(context.creator_preferences),
                  saved: context.creator_preferences,
                  updatedAt: context.preferences_updated_at,
                },
          );
          setFailure(null);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setData((previous) =>
            previous?.key === key
              ? { ...previous, revision: refresh }
              : previous,
          );
          setFailure({
            key,
            message:
              error instanceof Error
                ? error.message
                : "Could not load your ideas",
          });
        }
      });
    return () => controller.abort();
  }, [user, key, platform, savedOnly, refresh]);
  useEffect(
    () => () => {
      active.current?.abort();
      reading.current?.abort();
    },
    [],
  );

  function beginRequest() {
    if (requestActive.current || isLoadingContext) return null;
    requestActive.current = true;
    reading.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setNotice("");
    setFailure(null);
    return controller;
  }

  function endRequest(controller: AbortController) {
    if (active.current === controller) {
      requestActive.current = false;
      active.current = null;
      if (!controller.signal.aborted) {
        setOperation(null);
        setActionId("");
      }
    }
  }

  async function saveDirection() {
    if (!direction || !dirty || !current) return;
    const parsed = parseDirection(direction.draft);
    if (!parsed.preferences) return;
    const controller = beginRequest();
    if (!controller) return;
    setOperation("preferences");
    try {
      const result = await ideasApi.savePreferences(
        parsed.preferences,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setDirection({
        draft: directionDraft(result.preferences),
        saved: result.preferences,
        updatedAt: result.updated_at,
      });
      setData((previous) =>
        previous
          ? {
              ...previous,
              context: {
                ...previous.context,
                creator_preferences: result.preferences,
                preferences_updated_at: result.updated_at,
              },
            }
          : null,
      );
      setNotice(
        "Your direction is saved. New ideas will use these preferences.",
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setFailure({
          key,
          message:
            error instanceof Error
              ? error.message
              : "Could not save your direction",
        });
    } finally {
      endRequest(controller);
    }
  }

  async function refreshMemory() {
    if (dirty || !current?.context.can_generate) return;
    const controller = beginRequest();
    if (!controller) return;
    setOperation("memory");
    try {
      const refreshed = await ideasApi.refreshMemory(controller.signal);
      const context =
        platform === "all"
          ? refreshed
          : await ideasApi.context(platform, controller.signal);
      if (controller.signal.aborted) return;
      setData((previous) => (previous ? { ...previous, context } : null));
      setNotice("Channel memory refreshed from your saved history.");
    } catch (error) {
      if (!controller.signal.aborted)
        setFailure({
          key,
          message:
            error instanceof Error
              ? error.message
              : "Could not refresh channel memory",
        });
    } finally {
      endRequest(controller);
    }
  }

  async function generate() {
    if (dirty || !current?.context.can_generate) return;
    const controller = beginRequest();
    if (!controller) return;
    setOperation("generate");
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
        revision: refresh,
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
      endRequest(controller);
    }
  }

  async function update(idea: ContentIdea, status: ContentIdea["status"]) {
    const controller = beginRequest();
    if (!controller) return;
    setActionId(idea.id);
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
      endRequest(controller);
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
                disabled={controlsDisabled}
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
                disabled={controlsDisabled}
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
              disabled={
                controlsDisabled || dirty || !current?.context.can_generate
              }
              title={
                dirty
                  ? "Save your direction before generating ideas"
                  : undefined
              }
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
              disabled={controlsDisabled}
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
          {(busy || operation === "memory") && (
            <p className={styles.subtle} role="status">
              {operation === "memory"
                ? "Building channel memory from saved text and reviews."
                : "Building or refreshing channel memory as needed, then finding ideas for your direction."}{" "}
              Your videos are not being uploaded again. Leaving this page may
              not stop accepted generation.
            </p>
          )}
          {direction && (
            <DirectionEditor
              draft={direction.draft}
              dirty={dirty}
              updatedAt={direction.updatedAt}
              disabled={controlsDisabled || !current}
              saving={operation === "preferences"}
              onChange={(draft) =>
                setDirection((previous) =>
                  previous ? { ...previous, draft } : null,
                )
              }
              onSave={saveDirection}
              onReset={() =>
                setDirection((previous) =>
                  previous
                    ? { ...previous, draft: directionDraft(previous.saved) }
                    : null,
                )
              }
            />
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
                <MemoryPanel
                  memory={current.context.memory}
                  canGenerate={current.context.can_generate}
                  disabled={controlsDisabled || dirty}
                  refreshing={operation === "memory"}
                  onRefresh={refreshMemory}
                />
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
                    disabled={controlsDisabled}
                    aria-pressed={!savedOnly}
                    onClick={() => setSavedOnly(false)}
                  >
                    All ideas
                  </button>
                  <button
                    disabled={controlsDisabled}
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
                          {idea.creator_preferences.goal && (
                            <p>
                              Goal when generated:{" "}
                              {goalNames[idea.creator_preferences.goal]}.
                            </p>
                          )}
                          {idea.creator_preferences.filming_minutes != null && (
                            <p>
                              Filming time available:{" "}
                              {idea.creator_preferences.filming_minutes}{" "}
                              minutes.
                            </p>
                          )}
                          {idea.memory_generated_at && (
                            <p>
                              Used channel memory from{" "}
                              {localDate(idea.memory_generated_at)}.
                            </p>
                          )}
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
                            disabled={controlsDisabled}
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
                            disabled={controlsDisabled}
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
