"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ImageOff } from "lucide-react";
import type { Account } from "@/lib/account-api";
import {
  count,
  dateLabel,
  networks,
  rankNames,
  rankValue,
  type RankedContent,
  type Ranking,
} from "@/lib/dashboard-analytics";
import { PlatformIcon } from "../ui";
import styles from "./dashboard.module.css";

function Preview({ post }: { post: RankedContent }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.preview}>
      {post.thumbnail && !failed ? (
        // Existing provider URLs are used directly; unavailable previews have an explicit fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.thumbnail}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span title="Preview unavailable">
          <ImageOff size={19} aria-hidden="true" />
          <span className={styles.srOnly}>Preview unavailable</span>
        </span>
      )}
    </div>
  );
}

export function ContentRanking({
  ranked,
  total,
  ranking,
  onRanking,
  accounts,
  onReset,
}: {
  ranked: RankedContent[];
  total: number;
  ranking: Ranking;
  onRanking: (value: Ranking) => void;
  accounts: Account[];
  onReset: () => void;
}) {
  return (
    <section className={styles.ranking} aria-labelledby="content-ranking-title">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="content-ranking-title">
            Top 10 content<span className={styles.titlePeriod}>.</span>
          </h2>
          <p>
            {ranked.length} eligible of {total} collected posts · sorted by{" "}
            {rankNames[ranking].toLowerCase()}
          </p>
        </div>
        <label className={styles.selectLabel}>
          Rank by
          <select
            aria-label="Rank content by"
            value={ranking}
            onChange={(event) => onRanking(event.target.value as Ranking)}
          >
            {Object.entries(rankNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className={styles.method}>
        <summary>How rankings work</summary>
        <p>
          {ranking === "lift"
            ? "Response lift compares likes + comments with the median for the same account, platform, format and age at collection (under 7, 7–30, 31–90, 91–365 or over 365 days). At least three posts and a nonzero baseline are needed. A 2× result means twice that sample’s median response. This measures relative response, not equal audience size or a success probability."
            : ranking === "engagement"
              ? "Engagement rate is (likes + comments) ÷ recorded views. Both counters and positive views must be known. Shares are excluded to keep the numerator consistent. LinkedIn is excluded because comparable video views are unavailable."
              : ranking === "views"
                ? "Ranks known recorded video views. LinkedIn is excluded; impressions are never substituted. View definitions differ between platforms and these are captured lifetime counters, not unique people or views earned in the selected date range."
                : "Ranks known likes or reactions. Recorded zero is valid; missing counters are excluded. This is a raw response count and favors larger audiences."}{" "}
          {total - ranked.length > 0
            ? `${total - ranked.length} posts lack the metrics or peer history needed for this ranking.`
            : ""}{" "}
          Results cover the collected sample, not every post on your channels.
        </p>
      </details>
      {ranked.length ? (
        <table className={styles.contentTable}>
          <caption className={styles.srOnly}>
            Top ten collected posts by {rankNames[ranking]}. Unknown values are
            shown as a dash. Dates are UTC.
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Content</th>
              <th scope="col" className={styles.viewsColumn}>
                Views
              </th>
              <th scope="col" className={styles.interactionColumn}>
                Likes · comments · shares
              </th>
              <th scope="col">{rankNames[ranking]}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.slice(0, 10).map((post, index) => {
              const account = accounts.find(
                (a) => a.platform === post.platform,
              );
              return (
                <tr key={post.id}>
                  <td className={styles.rankNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <td>
                    <div className={styles.contentIdentity}>
                      <Preview post={post} />
                      <div className={styles.contentText}>
                        {post.url ? (
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.contentLink}
                          >
                            {post.caption || "Untitled post"}
                            <ArrowUpRight size={14} aria-hidden="true" />
                            <span className={styles.srOnly}>
                              {" "}
                              (opens in a new tab)
                            </span>
                          </a>
                        ) : (
                          <strong className={styles.contentLink}>
                            {post.caption || "Untitled post"}
                          </strong>
                        )}
                        <span className={styles.contentMeta}>
                          <PlatformIcon id={post.platform} size={13} />
                          <span>
                            {networks[post.platform].name} ·{" "}
                            {account?.display_name ||
                              account?.handle ||
                              "Account"}
                          </span>
                          <time dateTime={post.publishedAt ?? undefined}>
                            {dateLabel(post.publishedAt, true)}
                          </time>
                        </span>
                        <span className={styles.mobileMetrics}>
                          {post.platform !== "linkedin" && post.views != null
                            ? `${count(post.views)} views · `
                            : ""}
                          {count(post.likes)} likes · {count(post.comments)}{" "}
                          comments
                          {post.shares != null
                            ? ` · ${count(post.shares)} shares`
                            : ""}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td
                    className={styles.viewsColumn}
                    title={
                      post.platform === "linkedin"
                        ? "Comparable video views unavailable for LinkedIn"
                        : count(post.views, false)
                    }
                  >
                    {post.platform === "linkedin" ? "—" : count(post.views)}
                  </td>
                  <td className={styles.interactionColumn}>
                    <span
                      title={`${count(post.likes, false)} likes; ${count(post.comments, false)} comments; ${count(post.shares, false)} shares`}
                    >
                      {count(post.likes)} <span>·</span> {count(post.comments)}{" "}
                      <span>·</span> {count(post.shares)}
                    </span>
                  </td>
                  <td className={styles.rankResult}>
                    <strong>{rankValue(post.rankValue, ranking)}</strong>
                    {ranking === "lift" && (
                      <small>vs. {post.peers}-post median</small>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className={styles.rankingEmpty}>
          <strong>
            {total
              ? ranking === "lift"
                ? "Not enough comparable data yet."
                : `No ${rankNames[ranking].toLowerCase()} available in this view.`
              : "No collected posts in this view."}
          </strong>
          <p>
            {total
              ? ranking === "lift"
                ? "Response lift needs three comparable posts with complete likes and comments. Try ranking the available counters instead."
                : "The required counters were not collected or are not comparable. Choose another ranking or review your account data."
              : "Try another platform or a wider date range, or connect an account with published content."}
          </p>
          {total > 0 && ranking === "likes" ? (
            <Link className={styles.textButton} href="/accounts">
              Review account data
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <button
              className={styles.textButton}
              onClick={total ? () => onRanking("likes") : onReset}
            >
              {total ? "Rank by likes / reactions" : "Show all collected posts"}{" "}
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
