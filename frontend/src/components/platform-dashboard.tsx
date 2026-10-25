"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  Link2,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Account, Platform } from "@/lib/account-api";
import {
  loadAnalytics,
  canUpdate,
  updateAccount,
} from "@/lib/dashboard-loader";
import {
  audiencePlot,
  count,
  dateLabel,
  growth,
  interactionCount,
  known,
  median,
  networkOrder,
  networks,
  publicationPlot,
  ranges,
  rankContent,
  selectPosts,
  sumKnown,
  timestamp,
  type AnalyticsBundle,
  type ChartMetric,
  type Range,
  type Ranking,
  type Scope,
} from "@/lib/dashboard-analytics";
import { PlatformIcon } from "./ui";
import { PerformanceChart } from "./analytics/performance-chart";
import { ContentRanking } from "./analytics/content-ranking";
import styles from "./analytics/dashboard.module.css";

function Updated({ value }: { value: string | null }) {
  const time = timestamp(value);
  if (time == null) return <span>Update date unavailable</span>;
  const clock = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(time);
  return (
    <time
      dateTime={new Date(time).toISOString()}
      title={`${dateLabel(time, true)} at ${clock} UTC`}
    >
      Updated {dateLabel(time, true)}
    </time>
  );
}

function AccountList({
  data,
  scope,
  range,
  busy,
  progress,
  onUpdate,
}: {
  data: AnalyticsBundle;
  scope: Scope;
  range: Range;
  busy: Platform | null;
  progress: string;
  onUpdate: (account: Account) => void;
}) {
  const platforms = scope === "all" ? networkOrder : [scope];
  const details = data.accounts
    .filter((a) => platforms.includes(a.platform))
    .map((account) => ({
      platform: account.platform,
      fields: [
        ["Published posts", account.total_posts],
        [
          "Typical views",
          account.platform === "linkedin" ? null : account.typical_views,
        ],
        ["Posts / week", account.posts_per_week],
        [
          "Lifetime channel views",
          account.platform === "youtube" ? account.extra.channel_views : null,
        ],
      ].filter(
        (field): field is [string, number] =>
          typeof field[0] === "string" && known(field[1]),
      ),
    }))
    .filter((account) => account.fields.length);
  return (
    <aside className={styles.accounts} aria-labelledby="accounts-heading">
      <div className={styles.sectionHeader}>
        <h2 id="accounts-heading">Your accounts</h2>
        <Link
          href="/accounts"
          className={styles.iconLink}
          aria-label="Manage connected accounts"
        >
          <ArrowUpRight size={20} />
        </Link>
      </div>
      <ul>
        {platforms.map((platform) => {
          const account = data.accounts.find((a) => a.platform === platform);
          const change = growth(data.history[platform] ?? [], range);
          return (
            <li
              key={platform}
              className={!account ? styles.disconnected : undefined}
            >
              <div className={styles.accountIdentity}>
                <PlatformIcon id={platform} size={21} />
                <div>
                  <h3 className={styles.accountName}>
                    {networks[platform].name}
                  </h3>
                  <span>
                    {account
                      ? account.display_name ||
                        account.handle ||
                        "Connected account"
                      : "No account connected"}
                  </span>
                </div>
                {account && (
                  <strong
                    title={`${count(account.followers, false)} current followers or subscribers`}
                  >
                    {count(account.followers)}
                  </strong>
                )}
              </div>
              {account ? (
                <>
                  <div className={styles.accountStatus}>
                    <Updated value={account.updated_at} />
                    {canUpdate(account, data) ? (
                      <button
                        className={styles.textButton}
                        disabled={busy != null}
                        onClick={() => onUpdate(account)}
                        aria-label={`Update ${networks[platform].name} from provider`}
                      >
                        <RefreshCw
                          size={13}
                          className={busy === platform ? styles.spinning : ""}
                          aria-hidden="true"
                        />
                        {busy === platform ? "Updating…" : "Update"}
                      </button>
                    ) : (
                      <Link href="/accounts" className={styles.textButton}>
                        {account.connection === "manual"
                          ? "Edit stats"
                          : "Manage"}
                        <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                  <p className={styles.growth}>
                    {change ? (
                      <>
                        <b
                          className={
                            change.delta < 0 ? styles.negative : undefined
                          }
                        >
                          {change.delta > 0 ? "+" : ""}
                          {count(change.delta)} followers
                        </b>{" "}
                        · {dateLabel(change.since)}–
                        {dateLabel(change.through, true)}
                      </>
                    ) : (
                      "Growth unavailable · needs dated history"
                    )}
                  </p>
                  {busy === platform && (
                    <p className={styles.growth} role="status">
                      {progress}
                    </p>
                  )}
                </>
              ) : (
                <Link href="/accounts" className={styles.connectLink}>
                  Connect {networks[platform].name}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <p className={styles.accountFootnote}>
        Audience counts are current. Growth uses available dated collections
        within your selected range.
      </p>
      {details.length > 0 && (
        <details className={styles.accountDetails}>
          <summary>More account stats</summary>
          <p>
            Stored account totals and averages; independent of the publication
            filter.
          </p>
          {details.map((account) => (
            <div key={account.platform}>
              <h3>{networks[account.platform].name}</h3>
              <dl>
                {account.fields.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd title={count(value, false)}>{count(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </details>
      )}
    </aside>
  );
}

function DashboardContent({
  data,
  refreshing,
  error,
  notice,
  reload,
  busy,
  progress,
  onUpdate,
}: {
  data: AnalyticsBundle;
  refreshing: boolean;
  error: string;
  notice: string;
  reload: () => void;
  busy: Platform | null;
  progress: string;
  onUpdate: (account: Account) => void;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const [range, setRange] = useState<Range>("all");
  const [metric, setMetric] = useState<ChartMetric>("views");
  const [ranking, setRanking] = useState<Ranking>("lift");
  const visible = selectPosts(data.posts, scope, range);
  const selectedAccounts = data.accounts.filter(
    (a) => scope === "all" || a.platform === scope,
  );
  const ranked = rankContent(data.posts, visible, ranking);
  const comparable = rankContent(data.posts, visible, "lift");
  const interactions = visible.map(interactionCount);
  const viewPosts = visible.filter(
    (p) => p.platform !== "linkedin" && p.views != null,
  );
  const audienceKnown = selectedAccounts.filter(
    (a) => a.followers != null,
  ).length;
  const chart =
    metric === "audience"
      ? audiencePlot(data, scope, range)
      : publicationPlot(data.posts, scope, range, metric);
  const top = comparable[0];
  const medians = networkOrder
    .flatMap((platform) => {
      const values = visible
        .filter((p) => p.platform === platform)
        .map(interactionCount)
        .filter((v): v is number => v != null);
      return values.length
        ? [{ platform, median: median(values)!, n: values.length }]
        : [];
    })
    .sort((a, b) => b.median - a.median);
  const mainFinding =
    data.accounts.length === 0
      ? "Connect your first account to start comparing published content."
      : data.accounts.length === 1
        ? "One account connected. Add another to compare platforms."
        : `${data.accounts.length} connected accounts, one view of your published content.`;
  return (
    <>
      <header className={styles.header}>
        <div>
          <h1>
            Channel overview<span>.</span>
          </h1>
          <p>{mainFinding}</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/accounts" className={styles.secondary}>
            Manage accounts
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <button
            className={styles.reload}
            onClick={reload}
            disabled={refreshing || busy != null}
            aria-label="Reload saved dashboard data"
            title="Reload saved data; use each account’s Update to collect new stats"
          >
            <RefreshCw
              size={17}
              className={refreshing ? styles.spinning : ""}
              aria-hidden="true"
            />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </header>
      <div className={styles.filters}>
        <div
          className={styles.platformFilters}
          role="group"
          aria-label="Filter by platform"
        >
          <button
            aria-pressed={scope === "all"}
            onClick={() => setScope("all")}
          >
            All platforms<span>{data.accounts.length}</span>
          </button>
          {networkOrder.map((platform) => (
            <button
              key={platform}
              aria-pressed={scope === platform}
              onClick={() => setScope(platform)}
            >
              <PlatformIcon id={platform} size={17} />
              {networks[platform].name}
            </button>
          ))}
        </div>
        <label className={styles.rangeLabel}>
          <span className={styles.srOnly}>Publication date range</span>
          <select
            aria-label="Publication date range"
            value={range}
            onChange={(event) => setRange(event.target.value as Range)}
          >
            {(["all", "30", "90", "365"] as Range[]).map((value) => (
              <option value={value} key={value}>
                {ranges[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(error || data.issues.length > 0) && (
        <div className={styles.warning} role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            {error || data.issues.join(" ")}{" "}
            {error
              ? "Your last loaded results remain visible."
              : "Available results are shown."}
            {error.startsWith("Sign in") ? (
              <Link className={styles.textButton} href="/login?next=/dashboard">
                Sign in again
              </Link>
            ) : (
              <button
                className={styles.textButton}
                onClick={reload}
                disabled={refreshing}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}
      <div className={styles.srOnly} role="status">
        {`${visible.length} collected post${visible.length === 1 ? "" : "s"}. ${ranked.length} eligible for ranking.`}{" "}
        {notice}
      </div>
      {!selectedAccounts.length ? (
        <div className={styles.empty}>
          <Link2 size={30} aria-hidden="true" />
          <h2>
            {scope === "all"
              ? "Bring your accounts together."
              : `Connect ${networks[scope].name}.`}
          </h2>
          <p>
            Connect a social account to explore its published posts, audience
            and available performance data.
          </p>
          <Link href="/accounts" className={styles.primary}>
            Connect an account
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          {scope !== "all" && (
            <button
              className={styles.textButton}
              onClick={() => setScope("all")}
            >
              View all platforms
            </button>
          )}
        </div>
      ) : (
        <>
          <dl className={styles.kpis}>
            <div>
              <dt>Current audience</dt>
              <dd
                title={count(
                  sumKnown(selectedAccounts.map((a) => a.followers)),
                  false,
                )}
              >
                {count(sumKnown(selectedAccounts.map((a) => a.followers)))}
              </dd>
              <small>
                {audienceKnown}/{selectedAccounts.length} accounts · followers +
                subscribers
              </small>
            </div>
            <div>
              <dt>Recorded views</dt>
              <dd title={count(sumKnown(viewPosts.map((p) => p.views)), false)}>
                {count(sumKnown(viewPosts.map((p) => p.views)))}
              </dd>
              <small>
                {viewPosts.length}/{visible.length} posts · captured lifetime
                views
              </small>
            </div>
            <div>
              <dt>Likes + comments</dt>
              <dd title={count(sumKnown(interactions), false)}>
                {count(sumKnown(interactions))}
              </dd>
              <small>
                {interactions.filter((v) => v != null).length}/{visible.length}{" "}
                posts with both counters
              </small>
            </div>
            <div>
              <dt>Collected posts</dt>
              <dd>{count(visible.length)}</dd>
              <small>
                {range === "all"
                  ? "All available publication dates"
                  : "Published in selected date range"}
              </small>
            </div>
          </dl>
          <div className={styles.mainGrid}>
            <section
              className={styles.performance}
              aria-labelledby="performance-title"
            >
              <div className={styles.chartHeader}>
                <div>
                  <h2 id="performance-title">
                    {metric === "audience" ? "Audience" : "Content performance"}
                  </h2>
                  <p>
                    {metric === "audience"
                      ? chart.audienceBars
                        ? "A current snapshot of your connected accounts."
                        : "Follower counts at actual collection times."
                      : `Captured results, grouped by publication ${chart.cadence}.`}
                  </p>
                </div>
                <div
                  className={styles.metricFilters}
                  role="group"
                  aria-label="Chart metric"
                >
                  {(["views", "engagement", "audience"] as ChartMetric[]).map(
                    (value) => (
                      <button
                        key={value}
                        aria-pressed={metric === value}
                        onClick={() => setMetric(value)}
                      >
                        {value === "views"
                          ? "Views"
                          : value === "engagement"
                            ? "Engagement"
                            : "Audience"}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <PerformanceChart
                key={`${scope}:${range}:${metric}:${data.loadedAt}`}
                model={chart}
              />
              <p className={styles.chartExplanation}>
                {metric === "audience"
                  ? chart.audienceBars
                    ? "Growth needs at least two dated snapshots. Some account connections provide current totals only."
                    : "Shows up to 20 saved collections per account. Gaps between captures have no measured daily values."
                  : metric === "views"
                    ? "Each point is the median recorded lifetime views of posts published in that period—not views earned that week. LinkedIn is excluded."
                    : "Each point is the median likes + comments per post. Shares are shown separately in the content table. Missing periods remain gaps."}
              </p>
            </section>
            <AccountList
              data={data}
              scope={scope}
              range={range}
              busy={busy}
              progress={progress}
              onUpdate={onUpdate}
            />
          </div>
          <ContentRanking
            ranked={ranked}
            total={visible.length}
            ranking={ranking}
            onRanking={setRanking}
            accounts={data.accounts}
            onReset={() => {
              setScope("all");
              setRange("all");
            }}
          />
          <div className={styles.findings}>
            <div>
              <h2>
                {medians.length > 1
                  ? "Response by platform"
                  : "Typical response"}
              </h2>
              <p>
                Median likes + comments per collected post. Raw counts favor
                larger accounts.
              </p>
              <div className={styles.comparisons}>
                {medians.length ? (
                  medians.map((row) => (
                    <div key={row.platform}>
                      <span>
                        <PlatformIcon id={row.platform} size={17} />
                        {networks[row.platform].name}
                      </span>
                      <strong>{count(row.median)}</strong>
                      <small>{row.n} posts</small>
                    </div>
                  ))
                ) : (
                  <p>
                    Complete likes and comments are unavailable in this view.
                  </p>
                )}
              </div>
            </div>
            <div className={styles.nextStep}>
              <h2>{top ? "Build on a strong response" : "Your next step"}</h2>
              <p>
                {top ? (
                  <>
                    <span>
                      {top.caption.length > 100
                        ? `${top.caption.slice(0, 100)}…`
                        : top.caption}
                    </span>{" "}
                    earned <b>{top.rankValue.toFixed(2)}×</b> its comparable
                    sample’s median response on {networks[top.platform].name}.
                  </>
                ) : (
                  "Collect several posts in the same format to see which topics outperform your account’s usual response."
                )}
              </p>
              <Link href={top ? "/ideas" : "/accounts"}>
                {top ? "Explore follow-up ideas" : "Manage your collected data"}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
          {data.overview.draftScores.length > 0 && (
            <details className={styles.drafts}>
              <summary>
                Draft AI scores<span>Separate from published performance</span>
              </summary>
              <p>
                Average model estimates across saved draft reports. These are
                not measured engagement or growth.
              </p>
              <div>
                {data.overview.draftScores.map((d) => (
                  <span key={d.platform}>
                    <PlatformIcon
                      id={
                        d.platform === "shorts"
                          ? "shorts"
                          : (d.platform as Platform)
                      }
                      size={16}
                    />
                    <b>
                      {d.platform === "shorts"
                        ? "YouTube Shorts"
                        : networks[d.platform as Platform]?.name || d.platform}
                    </b>
                    <strong>{Math.round(d.average)}/100</strong>
                    <small>{d.reports} reports</small>
                  </span>
                ))}
              </div>
              <Link href="/reports" className={styles.textButton}>
                Open reports
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </details>
          )}
        </>
      )}
      <footer className={styles.footer}>
        <span>
          Based on your collected sample. Missing values appear as —.
          Publication dates use UTC.
        </span>
        <time dateTime={data.loadedAt}>
          Saved data loaded{" "}
          {new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(data.loadedAt))}
        </time>
      </footer>
    </>
  );
}

export function PlatformDashboard() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<AnalyticsBundle | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<Platform | null>(null);
  const [progress, setProgress] = useState("");
  const readController = useRef<AbortController | null>(null);
  const updateController = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setRefreshing(true);
    setError("");
    try {
      const result = await loadAnalytics(controller.signal);
      if (!controller.signal.aborted) {
        setData(result);
        setNotice("Saved dashboard data refreshed.");
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load your dashboard.",
        );
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    readController.current = controller;
    loadAnalytics(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load your dashboard.",
          );
      });
    return () => {
      readController.current?.abort();
      updateController.current?.abort();
    };
  }, [user]);
  const update = async (account: Account) => {
    if (updateController.current && !updateController.current.signal.aborted)
      return;
    const controller = new AbortController();
    updateController.current = controller;
    setBusy(account.platform);
    setProgress("Starting update…");
    setError("");
    try {
      await updateAccount(account, controller.signal, (message) => {
        if (!controller.signal.aborted) setProgress(message);
      });
      if (!controller.signal.aborted) {
        await reload();
        setNotice(`${networks[account.platform].name} updated.`);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Account update failed. Try again from Accounts.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy(null);
        setProgress("");
        controller.abort();
      }
    }
  };
  if (loading || (user && !data && !error))
    return (
      <section className={styles.page} aria-busy="true">
        <div className={styles.skeleton}>
          <h1>
            Channel overview<span>.</span>
          </h1>
          <p role="status">
            Loading your connected accounts and collected content…
          </p>
          <div />
          <div />
          <div />
        </div>
      </section>
    );
  if (!user)
    return (
      <section className={`${styles.page} ${styles.empty}`}>
        <h1>
          Channel overview<span>.</span>
        </h1>
        <p>Sign in to compare your connected accounts.</p>
        <Link href="/login?next=/dashboard" className={styles.primary}>
          Sign in
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    );
  if (!data)
    return (
      <section className={`${styles.page} ${styles.empty}`}>
        <AlertCircle size={28} aria-hidden="true" />
        <h1>Couldn’t load your dashboard.</h1>
        <p role="alert">{error}</p>
        {error.startsWith("Sign in") ? (
          <Link className={styles.primary} href="/login?next=/dashboard">
            Sign in again
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        ) : (
          <button
            className={styles.primary}
            onClick={() => void reload()}
            disabled={refreshing}
          >
            Try again
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        )}
      </section>
    );
  return (
    <section className={styles.page}>
      <DashboardContent
        data={data}
        refreshing={refreshing}
        error={error}
        notice={notice}
        reload={() => void reload()}
        busy={busy}
        progress={progress}
        onUpdate={(account) => void update(account)}
      />
    </section>
  );
}
