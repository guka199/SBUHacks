"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Lightbulb, Link2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  compact,
  loadDashboard,
  sparkline,
  type DashboardData,
} from "@/lib/dashboard";
import { PlatformIcon } from "./ui";

const NAMES: Record<string, string> = {
  youtube: "YouTube",
  shorts: "YouTube Shorts",
  tiktok: "TikTok",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};
const name = (id: string) => NAMES[id] ?? id;
type IconId = Parameters<typeof PlatformIcon>[0]["id"];
const icon = (id: string) => <PlatformIcon id={id as IconId} />;

export function PlatformDashboard() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    loadDashboard(controller.signal)
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load dashboard");
      });
    return () => controller.abort();
  }, [user]);

  if (loading || (user && !data && !error))
    return (
      <section className="account-page page-gutter">
        <p role="status">Loading your platforms…</p>
      </section>
    );
  if (!user)
    return (
      <section className="account-page page-gutter">
        <h1>Your platforms.</h1>
        <p>
          <Link href="/login?next=/dashboard" className="text-link">
            Sign in
          </Link>{" "}
          to compare your accounts.
        </p>
      </section>
    );
  if (error || !data)
    return (
      <section className="account-page page-gutter">
        <p className="error-message" role="alert">
          {error}
        </p>
      </section>
    );
  if (!data.platforms.length)
    return (
      <section className="account-page page-gutter dashboard-empty">
        <h1>Your platforms.</h1>
        <p>
          Link YouTube, TikTok, Instagram or LinkedIn to see where your content
          works best.
        </p>
        <Link href="/accounts" className="button button-accent">
          <Link2 size={18} /> Connect your accounts
        </Link>
      </section>
    );

  const weeklyOf = (platform: string) =>
    data.weekly
      .filter((w) => w.platform === platform)
      .map((w) => w.medianViews);
  const reach = data.platforms
    .filter((p) => p.reachPerFollower)
    .sort((a, b) => b.reachPerFollower! - a.reachPerFollower!);
  const maxReach = Math.max(...reach.map((p) => p.reachPerFollower!), 0);
  const engagement = data.platforms
    .filter((p) => p.engagementRate)
    .sort((a, b) => b.engagementRate! - a.engagementRate!);
  const maxEngagement = Math.max(
    ...engagement.map((p) => p.engagementRate!),
    0,
  );
  const mixedBasis = new Set(engagement.map((p) => p.engagementBasis)).size > 1;

  return (
    <section className="page-gutter platform-dashboard">
      <div className="dashboard-title">
        <div>
          <h1>Your platforms.</h1>
          <p>Where your content is working, side by side.</p>
        </div>
        <Link href="/accounts" className="button button-outline button-small">
          Manage accounts <ArrowUpRight size={16} />
        </Link>
      </div>

      {data.takeaways.length > 0 && (
        <div className="dashboard-takeaways">
          <Lightbulb size={20} aria-hidden="true" />
          <ul>
            {data.takeaways.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="dashboard-cards">
        {data.platforms.map((p) => {
          const trend = weeklyOf(p.platform);
          return (
            <article
              key={p.platform}
              className={`dashboard-card ${data.strongest === p.platform ? "strongest" : ""}`}
            >
              <header>
                {icon(p.platform)}
                <h2>{name(p.platform)}</h2>
                {data.strongest === p.platform && (
                  <span className="best-label">Strongest reach</span>
                )}
              </header>
              {p.handle &&
                (p.profileUrl ? (
                  <a href={p.profileUrl} target="_blank" rel="noreferrer">
                    @{p.handle.replace(/^@/, "")}
                  </a>
                ) : (
                  <span className="dashboard-handle">
                    @{p.handle.replace(/^@/, "")}
                  </span>
                ))}
              <dl>
                <div>
                  <dt>Followers</dt>
                  <dd>{compact(p.followers)}</dd>
                </div>
                <div>
                  <dt>Typical views</dt>
                  <dd>{compact(p.typicalViews)}</dd>
                </div>
                <div>
                  <dt>Engagement</dt>
                  <dd>
                    {p.engagementRate
                      ? `${(p.engagementRate * 100).toFixed(1)}%`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Posts / week</dt>
                  <dd>{p.postsPerWeek ? p.postsPerWeek.toFixed(1) : "—"}</dd>
                </div>
              </dl>
              {trend.length >= 2 && (
                <div className="dashboard-trend">
                  <svg
                    viewBox="0 0 120 32"
                    role="img"
                    aria-label={`Median views per week on ${name(p.platform)}, last ${trend.length} weeks with posts`}
                  >
                    <polyline points={sparkline(trend)} />
                  </svg>
                  <span>
                    Median views / week · latest {compact(trend.at(-1))}
                  </span>
                </div>
              )}
              <small className="dashboard-source">
                {p.connection === "api"
                  ? "Linked automatically"
                  : "Entered manually"}
              </small>
            </article>
          );
        })}
      </div>

      <div className="dashboard-compare">
        {reach.length > 0 && (
          <section aria-labelledby="reach-title" className="report-card">
            <h2 id="reach-title">Reach per follower</h2>
            <p>
              Typical views ÷ followers. Higher means each post travels further.
            </p>
            <ul className="dashboard-bars">
              {reach.map((p) => (
                <li key={p.platform}>
                  <span>
                    {icon(p.platform)} {name(p.platform)}
                  </span>
                  <meter
                    min={0}
                    max={maxReach}
                    value={p.reachPerFollower!}
                    aria-label={`${name(p.platform)} reach per follower`}
                  />
                  <b>{p.reachPerFollower!.toFixed(2)}×</b>
                </li>
              ))}
            </ul>
          </section>
        )}
        {engagement.length > 0 && (
          <section aria-labelledby="engagement-title" className="report-card">
            <h2 id="engagement-title">Engagement</h2>
            <p>
              Likes, comments and shares per{" "}
              {mixedBasis
                ? "view, or per follower where views aren’t available"
                : (engagement[0].engagementBasis ?? "view")}
              .
            </p>
            <ul className="dashboard-bars">
              {engagement.map((p) => (
                <li key={p.platform}>
                  <span>
                    {icon(p.platform)} {name(p.platform)}
                  </span>
                  <meter
                    min={0}
                    max={maxEngagement}
                    value={p.engagementRate!}
                    aria-label={`${name(p.platform)} engagement`}
                  />
                  <b>
                    {(p.engagementRate! * 100).toFixed(1)}%
                    {mixedBasis && <small> /{p.engagementBasis}</small>}
                  </b>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {data.topPosts.length > 0 && (
        <section aria-labelledby="top-title" className="dashboard-section">
          <h2 id="top-title">Top posts</h2>
          <ol className="dashboard-posts">
            {data.topPosts.map((post, i) => (
              <li key={`${post.platform}-${i}`}>
                <span className="dashboard-rank">{i + 1}</span>
                {icon(post.platform)}
                <div>
                  {post.url ? (
                    <a href={post.url} target="_blank" rel="noreferrer">
                      {post.caption || "Untitled post"}
                    </a>
                  ) : (
                    <strong>{post.caption || "Untitled post"}</strong>
                  )}
                  <small>
                    {compact(post.views)} views
                    {post.likes != null && ` · ${compact(post.likes)} likes`}
                    {post.comments != null &&
                      ` · ${compact(post.comments)} comments`}
                    {post.postedAt &&
                      ` · ${new Date(post.postedAt.replace(" ", "T")).toLocaleDateString()}`}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.draftScores.length > 0 && (
        <section
          aria-labelledby="drafts-title"
          className="report-card dashboard-section"
        >
          <h2 id="drafts-title">How your drafts score</h2>
          <p>
            Average predicted score per platform across your saved reports.{" "}
            <Link href="/reports" className="text-link">
              See reports
            </Link>
          </p>
          <ul className="dashboard-bars">
            {data.draftScores.map((d) => (
              <li key={d.platform}>
                <span>
                  {icon(d.platform)} {name(d.platform)}
                </span>
                <meter
                  min={0}
                  max={100}
                  value={d.average}
                  aria-label={`${name(d.platform)} average draft score`}
                />
                <b>
                  {Math.round(d.average)}
                  <small>
                    {" "}
                    · {d.reports} report{d.reports === 1 ? "" : "s"}
                  </small>
                </b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
