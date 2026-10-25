"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Lightbulb,
  Loader2,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CopyButton } from "@/components/ui";
import {
  ideasApi,
  ideaKindNames,
  ideaPlatforms,
  localDate,
  platformNames,
  sourceLink,
  type ChannelContext,
  type ChannelMemory,
  type ContentIdea,
  type CreatorPreferences,
  type IdeaTarget,
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
import {
  ResearchSummary,
  SearchSuggestions,
  TrendControls,
  TrendSources,
} from "./trend-context";

function ideaCopy(idea: ContentIdea) {
  const outline = idea.outline
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
  const versions = idea.adaptations
    .map(
      (version) =>
        `${platformNames[version.platform]} · ${version.format}\n${version.hook}\n${version.execution}`,
    )
    .join("\n\n");
  return [idea.title, idea.hook, outline, versions]
    .filter(Boolean)
    .join("\n\n");
}

function PlatformAdaptations({ idea }: { idea: ContentIdea }) {
  const [selected, setSelected] = useState(idea.adaptations[0]?.platform);
  const version =
    idea.adaptations.find((item) => item.platform === selected) ??
    idea.adaptations[0];
  if (!version) return null;
  return (
    <section className={styles.adaptations} aria-label="Platform versions">
      <h3 className={styles.detailLabel}>Make it work on each platform</h3>
      <div
        className={styles.platformChoices}
        role="group"
        aria-label={`Platform versions for ${idea.title}`}
      >
        {idea.adaptations.map((item) => (
          <button
            key={item.platform}
            type="button"
            aria-pressed={version.platform === item.platform}
            onClick={() => setSelected(item.platform)}
          >
            {platformNames[item.platform]}
          </button>
        ))}
      </div>
      <div
        className={styles.platformVersion}
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>{version.format}</strong>
        <p className={styles.versionHook}>{version.hook}</p>
        <p>{version.execution}</p>
      </div>
    </section>
  );
}

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
            style or audience details under Customize.
          </p>
        </>
      )}
    </section>
  );
}

export default function IdeasPage() {
  const { user, loading } = useAuth();
  const [platform, setPlatform] = useState<IdeaTarget | "all">("all");
  const [useTrends, setUseTrends] = useState(true);
  const [region, setRegion] = useState("US");
  const [trendTopic, setTrendTopic] = useState("");
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
  const [dismissedIdea, setDismissedIdea] = useState<ContentIdea | null>(null);
  const [generatedBatch, setGeneratedBatch] = useState("");
  const resultsHeading = useRef<HTMLHeadingElement | null>(null);
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
  const directionError = direction ? parseDirection(direction.draft).error : "";
  const trendTopicError =
    useTrends && !!trendTopic.trim() && trendTopic.trim().length < 2;
  const latestResearch =
    current?.context.trend_research ??
    current?.ideas.find((idea) => idea.trend_research)?.trend_research;

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
  useEffect(() => {
    if (!generatedBatch) return;
    const frame = requestAnimationFrame(() => {
      resultsHeading.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      resultsHeading.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [generatedBatch]);

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

  async function persistDirection(controller: AbortController) {
    if (!direction)
      throw new Error("Your preferences are still loading. Please try again.");
    const parsed = parseDirection(direction.draft);
    if (!parsed.preferences) throw new Error(parsed.error);
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
  }

  async function saveDirection() {
    if (!direction || !dirty || !current) return;
    const controller = beginRequest();
    if (!controller) return;
    setOperation("preferences");
    try {
      await persistDirection(controller);
      if (controller.signal.aborted) return;
      setNotice("Preferences saved. New ideas will use them.");
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
    if (
      !current?.context.can_generate ||
      (dirty && directionError) ||
      trendTopicError
    )
      return;
    const controller = beginRequest();
    if (!controller) return;
    setOperation("generate");
    try {
      if (dirty) await persistDirection(controller);
      if (controller.signal.aborted) return;
      const result = await ideasApi.generate(
        platform === "all" ? null : platform,
        3,
        controller.signal,
        {
          use_trends: useTrends,
          region_code: region,
          trend_topic: trendTopic.trim() || null,
        },
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
      setGeneratedBatch(result.ideas[0]?.batch_id ?? "");
      setDismissedIdea(null);
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
              ideas: (previous.ideas.some((item) => item.id === updated.id)
                ? previous.ideas.map((item) =>
                    item.id === updated.id ? updated : item,
                  )
                : [updated, ...previous.ideas]
              ).filter(
                (item) =>
                  item.status !== "dismissed" &&
                  (!savedOnly || item.status === "saved"),
              ),
            }
          : null,
      );
      const restored = dismissedIdea?.id === idea.id && status !== "dismissed";
      setDismissedIdea(status === "dismissed" ? idea : null);
      setNotice(
        restored
          ? "Idea restored."
          : status === "saved"
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

  async function rateIdea(
    idea: ContentIdea,
    feedback: ContentIdea["feedback"],
  ) {
    const controller = beginRequest();
    if (!controller) return;
    setActionId(idea.id);
    try {
      const updated = await ideasApi.feedback(
        idea.id,
        feedback,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setData((previous) =>
        previous
          ? {
              ...previous,
              ideas: previous.ideas.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : null,
      );
      setNotice(
        feedback
          ? "Feedback saved. Compare usefulness across idea types below."
          : "Feedback removed.",
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setFailure({
          key,
          message:
            error instanceof Error ? error.message : "Could not save feedback",
        });
    } finally {
      endRequest(controller);
    }
  }

  return (
    <div className={`page-gutter ${styles.page}`}>
      <header className={styles.heading}>
        <h1>What’s your next post?</h1>
        <p>Fresh ideas, shaped by your channel.</p>
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
          {notice && (
            <p className={styles.notice} role="status">
              <Check size={16} />
              {notice}
              {dismissedIdea && (
                <button
                  className="text-link"
                  disabled={controlsDisabled}
                  onClick={() => update(dismissedIdea, dismissedIdea.status)}
                >
                  Undo
                </button>
              )}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </p>
          )}
          {current && !current.context.can_generate && (
            <section
              className={styles.historyStatus}
              aria-label="Content readiness"
            >
              <div>
                <span
                  className={
                    current.context.can_generate
                      ? styles.ready
                      : styles.needsHistory
                  }
                >
                  {current.context.can_generate ? (
                    <Check size={15} />
                  ) : (
                    <Lightbulb size={15} />
                  )}
                  {current.context.can_generate
                    ? "Your channel history is ready"
                    : "Start with a little content history"}
                </span>
                <p>
                  {current.context.published_posts} posts ·{" "}
                  {current.context.draft_reviews} video reviews ·{" "}
                  {current.context.accounts.length} connected accounts
                </p>
                {!current.context.can_generate && (
                  <p>
                    Add at least two different posts or video reviews. You have{" "}
                    {current.context.distinct_content} so far.
                  </p>
                )}
              </div>
              <div className={styles.historyActions}>
                {!current.context.can_generate && (
                  <>
                    <Link href="/accounts" className="button button-light">
                      Connect a channel
                    </Link>
                    <Link href="/analyze" className="text-link">
                      Analyze a video <ArrowUpRight size={14} />
                    </Link>
                  </>
                )}
                <button
                  className="text-link"
                  disabled={controlsDisabled}
                  onClick={() => {
                    setFailure(null);
                    setRefresh((value) => value + 1);
                  }}
                  title="Reload saved history. Refresh platform statistics on Accounts."
                >
                  <RefreshCw size={14} /> Reload history
                </button>
              </div>
            </section>
          )}
          <section
            className={styles.generator}
            id="generate-ideas"
            aria-labelledby="generate-heading"
          >
            <h2 id="generate-heading" className={styles.srOnly}>
              Generate ideas
            </h2>
            <div className={styles.controls}>
              <label>
                Platform
                <select
                  value={platform}
                  disabled={controlsDisabled}
                  onChange={(event) => {
                    setPlatform(event.target.value as IdeaTarget | "all");
                    setNotice("");
                  }}
                >
                  <option value="all">Choose for me</option>
                  <option value="all_platforms">All platforms</option>
                  {ideaPlatforms.map((id) => (
                    <option key={id} value={id}>
                      {platformNames[id]}
                    </option>
                  ))}
                </select>
              </label>
              <TrendControls
                enabled={useTrends}
                region={region}
                topic={trendTopic}
                suggestedTopic={
                  current?.context.creator.niche ??
                  current?.context.memory?.themes[0]?.label ??
                  ""
                }
                disabled={controlsDisabled}
                onEnabled={setUseTrends}
                onRegion={setRegion}
                onTopic={setTrendTopic}
              />
            </div>
            {direction && (
              <DirectionEditor
                draft={direction.draft}
                dirty={dirty}
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
            {platform === "all_platforms" && (
              <p className={styles.fieldHint}>
                Shared concepts for YouTube, Shorts, TikTok, Instagram and
                LinkedIn, using your available account history.
              </p>
            )}
            {trendTopicError && (
              <p className="error-message" role="alert">
                Use at least two characters for the research topic, or leave it
                blank.
              </p>
            )}
            <div className={styles.generationAction}>
              <button
                className="button button-accent"
                onClick={generate}
                disabled={
                  controlsDisabled ||
                  (dirty && !!directionError) ||
                  trendTopicError ||
                  !current?.context.can_generate
                }
                title={
                  dirty
                    ? "Your preferences will be saved before generating"
                    : undefined
                }
              >
                {busy ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <Lightbulb size={18} />
                )}
                {busy
                  ? "Creating your ideas…"
                  : dirty
                    ? "Save & generate ideas"
                    : "Generate ideas"}
              </button>
              <p className={styles.fieldHint}>
                {isLoadingContext
                  ? "Loading your channel history…"
                  : !current?.context.can_generate
                    ? "Add two different posts or video reviews to get started."
                    : dirty && directionError
                      ? "Check the highlighted preferences above before continuing."
                      : dirty
                        ? "One click saves your preferences, then creates ideas tailored to them."
                        : ""}
              </p>
            </div>
          </section>
          {(busy || operation === "memory") && (
            <p className={styles.generationStatus} role="status">
              <Loader2 size={18} className="spin" aria-hidden="true" />
              {operation === "memory"
                ? "Building channel memory from saved text and reviews."
                : useTrends
                  ? "Finding recent inspiration and creating your ideas…"
                  : "Creating ideas from your channel history…"}
            </p>
          )}
          {error && (
            <div className={styles.errorPanel} role="alert">
              <p>{error}</p>
              <button
                className="text-link"
                disabled={working}
                onClick={() => {
                  setFailure(null);
                  setRefresh((value) => value + 1);
                }}
              >
                Reload data
              </button>
            </div>
          )}
          {!current && !error ? (
            <p role="status">Loading your channel history…</p>
          ) : (
            current && (
              <>
                {latestResearch && (
                  <ResearchSummary
                    research={latestResearch}
                    viewedAt={current.context.collected_at}
                    crossPlatform={platform === "all_platforms"}
                  />
                )}
                <details className={styles.knowledge}>
                  <summary>
                    <span>Channel context</span>
                    <ChevronDown size={17} aria-hidden="true" />
                  </summary>
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
                      <button
                        className="text-link"
                        disabled={controlsDisabled}
                        onClick={() => {
                          setFailure(null);
                          setRefresh((value) => value + 1);
                        }}
                      >
                        <RefreshCw size={14} /> Reload history
                      </button>
                      <small>
                        Latest stored context:{" "}
                        {localDate(current.context.last_updated)}. Refresh
                        account statistics on{" "}
                        <Link href="/accounts">Accounts</Link>.
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
                  {dirty && (
                    <p className={styles.fieldHint}>
                      Save your preferences or generate ideas before refreshing
                      memory.
                    </p>
                  )}
                </details>
                <div className={styles.resultsHeading} id="ideas-results">
                  <div>
                    <h2 ref={resultsHeading} tabIndex={-1}>
                      {savedOnly
                        ? "Saved for later"
                        : platform === "all_platforms"
                          ? "Cross-platform ideas"
                          : "Your ideas"}
                    </h2>
                  </div>
                  <span className={styles.subtle}>
                    {current.ideas.length}{" "}
                    {current.ideas.length === 1 ? "idea" : "ideas"}
                    {current.ideas.length === 50 ? " shown" : ""}
                  </span>
                </div>
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
                  <section className={styles.resultsEmpty}>
                    {savedOnly ? (
                      <Bookmark size={24} />
                    ) : (
                      <Lightbulb size={24} />
                    )}
                    <h3>
                      {savedOnly
                        ? "Keep your favorites here."
                        : "Your next ideas will appear here."}
                    </h3>
                    <p>
                      {savedOnly
                        ? "Use Save idea on any suggestion, and you can come back to it here."
                        : current.context.can_generate
                          ? "Generate three ideas to get started."
                          : "Connect a channel or analyze two videos. Your follow-up ideas will appear here."}
                    </p>
                    {savedOnly ? (
                      <button
                        className="text-link"
                        disabled={controlsDisabled}
                        onClick={() => setSavedOnly(false)}
                      >
                        Browse all ideas <ArrowUpRight size={14} />
                      </button>
                    ) : (
                      current.context.can_generate && (
                        <a href="#generate-ideas" className="text-link">
                          Go to generator ↑
                        </a>
                      )
                    )}
                  </section>
                ) : (
                  <div className={styles.grid}>
                    {current.ideas.map((idea) => (
                      <article key={idea.id} className={styles.card}>
                        <div className={styles.cardTop}>
                          <span className={styles.badge}>
                            {platformNames[idea.platform]}
                          </span>
                          <span className={styles.eyebrow}>
                            {idea.idea_kind
                              ? ideaKindNames[idea.idea_kind]
                              : idea.approach.replace("_", " ")}
                          </span>
                          <CopyButton
                            text={ideaCopy(idea)}
                            label="Copy content idea"
                          />
                        </div>
                        <h2>{idea.title}</h2>
                        <blockquote>{idea.hook}</blockquote>
                        <details className={styles.ideaDetails}>
                          <summary>
                            View details{" "}
                            <ChevronDown size={15} aria-hidden="true" />
                          </summary>
                          {!!idea.adaptations.length && (
                            <PlatformAdaptations idea={idea} />
                          )}
                          <h3 className={styles.detailLabel}>
                            {idea.platform === "all_platforms"
                              ? "Shared concept outline"
                              : "Post outline"}
                          </h3>
                          <ol>
                            {idea.outline.map((beat, index) => (
                              <li key={index}>{beat}</li>
                            ))}
                          </ol>
                          <section className={styles.rationale}>
                            <h3>Why it fits your channel</h3>
                            <p>{idea.rationale}</p>
                          </section>
                          {!!idea.trend_sources.length && (
                            <details className={styles.evidence}>
                              <summary>
                                Recent signals behind this idea (
                                {idea.trend_sources.length})
                              </summary>
                              <TrendSources sources={idea.trend_sources} />
                              {idea.trend_research?.notes.map((note) => (
                                <p key={note}>{note}</p>
                              ))}
                              {idea.trend_research && (
                                <SearchSuggestions
                                  widgets={
                                    idea.trend_research.search_suggestions
                                  }
                                />
                              )}
                            </details>
                          )}
                          <details className={styles.evidence}>
                            <summary>
                              Inspired by {idea.sources.length} of your posts /
                              reviews
                            </summary>
                            <p>{idea.channel_summary}</p>
                            {idea.creator_preferences.filming_minutes !=
                              null && (
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
                          <div
                            className={styles.ideaFeedback}
                            role="group"
                            aria-label={`Was ${idea.title} useful?`}
                          >
                            <span>Useful idea?</span>
                            <button
                              disabled={controlsDisabled}
                              aria-pressed={idea.feedback === "useful"}
                              onClick={() =>
                                rateIdea(
                                  idea,
                                  idea.feedback === "useful" ? null : "useful",
                                )
                              }
                            >
                              <ThumbsUp size={14} /> Yes
                            </button>
                            <button
                              disabled={controlsDisabled}
                              aria-pressed={idea.feedback === "not_useful"}
                              onClick={() =>
                                rateIdea(
                                  idea,
                                  idea.feedback === "not_useful"
                                    ? null
                                    : "not_useful",
                                )
                              }
                            >
                              <ThumbsDown size={14} /> Not for me
                            </button>
                          </div>
                        </details>
                        <footer>
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
                            className="text-link"
                            aria-label={`Dismiss ${idea.title}`}
                            title="Dismiss idea"
                            disabled={controlsDisabled}
                            onClick={() => update(idea, "dismissed")}
                          >
                            <X size={14} /> Dismiss
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
            AI suggestions, not performance guarantees.
          </p>
        </>
      )}
    </div>
  );
}
