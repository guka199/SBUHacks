"use client";
import {
  Bell,
  ChartNoAxesCombined,
  ChevronDown,
  Home,
  Image as ImageIcon,
  Instagram,
  MessageCircle,
  Music2,
  Play,
  Search,
  Settings,
  Users,
  Youtube,
} from "lucide-react";
type Tool = "youtube" | "instagram" | "tiktok";
const copy = {
  youtube: {
    name: "YouTube Studio",
    title: "Channel analytics",
    sub: "Your channel is finding its people.",
    labels: ["Video views", "Watch time", "Subscribers"],
    values: ["24.8K", "618 hrs", "+126"],
    graph: "Audience retention",
  },
  instagram: {
    name: "Instagram Insights",
    title: "Reels insights",
    sub: "How people connected with your content.",
    labels: ["Accounts reached", "Engagement", "Reel views"],
    values: ["18,420", "1,284", "32.6K"],
    graph: "Reach over the last 7 days",
  },
  tiktok: {
    name: "TikTok Analytics",
    title: "Video overview",
    sub: "The story behind your latest video.",
    labels: ["Video views", "Avg. watch time", "New followers"],
    values: ["48.2K", "12.8 s", "+208"],
    graph: "Video views over time",
  },
};
export function AnalyticsWindow({
  tool,
  extra = false,
}: {
  tool: Tool;
  extra?: boolean;
}) {
  const c = copy[tool],
    Icon =
      tool === "youtube" ? Youtube : tool === "instagram" ? Instagram : Music2;
  return (
    <div
      className={`analytics-window tool-${tool} ${extra ? "extra-window" : ""}`}
      data-tool={tool}
    >
      <header className="aw-chrome">
        <span className="traffic-lights">
          <i />
          <i />
          <i />
        </span>
        <span className="aw-tab">
          <Icon size={12} />
          {c.name}
          <span>×</span>
        </span>
        <span className="aw-chrome-plus">+</span>
        <span className="aw-chrome-url">
          studio.creator.example / analytics
        </span>
      </header>
      <div className="aw-layout">
        <aside>
          <div className="aw-brand">
            <Icon size={20} />
            <b>
              {tool === "youtube"
                ? "Studio"
                : tool === "instagram"
                  ? "Insights"
                  : "TikTok"}
            </b>
          </div>
          <div className="aw-avatar">S</div>
          <b>Studio notes</b>
          <small>Creator account</small>
          {[
            [Home, "Overview"],
            [Play, "Content"],
            [ChartNoAxesCombined, "Analytics"],
            [Users, "Audience"],
            [MessageCircle, "Comments"],
            [Settings, "Settings"],
          ].map(([Item, label], i) => {
            const Glyph = Item as typeof Home;
            return (
              <div className={i === 2 ? "active" : ""} key={String(label)}>
                <Glyph size={13} />
                {String(label)}
                {i === 4 && <em>12</em>}
              </div>
            );
          })}
        </aside>
        <section>
          <div className="aw-heading">
            <div>
              <h3>{c.title}</h3>
              <p>{c.sub}</p>
            </div>
            <Bell size={16} />
          </div>
          <div className="aw-subnav">
            <b>Overview</b>
            <span>Content</span>
            <span>Audience</span>
            <span className="aw-period">
              Last 28 days <ChevronDown size={10} />
            </span>
          </div>
          <div className="aw-metrics">
            {c.labels.map((label, i) => (
              <div key={label}>
                <span>{label}</span>
                <strong data-count={c.values[i]}>{c.values[i]}</strong>
                <small>
                  {i === 1 && tool === "tiktok"
                    ? "Of a 24-second video"
                    : "↑ More than the previous period"}
                </small>
              </div>
            ))}
          </div>
          <div className="aw-chart-title">
            <b>{c.graph}</b>
            <span>
              {tool === "youtube"
                ? "Typical retention"
                : "Illustrative sample data"}
            </span>
          </div>
          <div className="aw-chart">
            <span className="aw-axis">
              100%
              <br />
              50%
              <br />
              0%
            </span>
            <svg viewBox="0 0 420 100" preserveAspectRatio="none">
              <path
                d="M0 10H420M0 48H420M0 86H420"
                fill="none"
                stroke="currentColor"
                opacity=".08"
              />
              {tool === "youtube" ? (
                <>
                  <path
                    className="aw-area"
                    d="M0 13 25 20 48 23 70 40 95 35 130 43 165 48 200 47 235 55 270 58 310 65 350 62 385 71 420 74V95H0Z"
                  />
                  <path
                    className="aw-line"
                    pathLength={1}
                    d="M0 13 25 20 48 23 70 40 95 35 130 43 165 48 200 47 235 55 270 58 310 65 350 62 385 71 420 74"
                  />
                </>
              ) : (
                <>
                  {[24, 39, 31, 60, 45, 78, 57, 92, 70, 98, 81, 75].map(
                    (h, i) => (
                      <rect
                        key={i}
                        className="aw-bar"
                        x={i * 35 + 3}
                        y={100 - h}
                        width="20"
                        height={h}
                        rx="3"
                      />
                    ),
                  )}
                </>
              )}
            </svg>
          </div>
          <div className="aw-chart-axis">
            <span>{tool === "youtube" ? "0:00" : "Mon"}</span>
            <span>{tool === "youtube" ? "0:08" : "Wed"}</span>
            <span>{tool === "youtube" ? "0:16" : "Fri"}</span>
            <span>{tool === "youtube" ? "0:24" : "Sun"}</span>
          </div>
          <div className="aw-bottom">
            <div className="aw-thumb">
              <ImageIcon size={22} />
              <Play size={12} />
            </div>
            <div>
              <b>Make something before you feel ready.</b>
              <span>Latest upload · 24 seconds</span>
            </div>
            <strong>
              {tool === "youtube"
                ? "8.2K"
                : tool === "instagram"
                  ? "4,280"
                  : "12.6K"}
              <small>views</small>
            </strong>
          </div>
        </section>
      </div>
      <footer className="aw-footer">
        <span className="aw-dot" /> Original illustrative interface · No real
        account data <Search size={10} />
      </footer>
    </div>
  );
}
