"use client";
import { Bell, Instagram, Music2, Youtube, ArrowLeft } from "lucide-react";
import { AnalyticsWindow } from "./AnalyticsWindow";
import { LiquidGlass } from "./LiquidGlass";
import { ProductDemonstration } from "./ProductDemonstration";
import { Dashboard } from "../dashboard";
import { notifications } from "@/lib/experience";
export function MonitorExperience({ onBack }: { onBack?: () => void }) {
  return (
    <div className="monitor-experience">
      <div className="creator-desktop" aria-hidden="true">
        <div className="desktop-wallpaper" />
        <div className="desktop-status">
          <span>Creator desktop</span>
          <span>Mon 9:41 AM</span>
        </div>
        <div className="creator-loop">
          {(["youtube", "instagram", "tiktok"] as const).map((tool) => (
            <div className={`chaos-window merge-${tool}`} key={tool}>
              <div className={`auto-window auto-${tool}`}>
                <AnalyticsWindow tool={tool} />
              </div>
            </div>
          ))}
          <div className="browser-tab-pool">
            {[
              "YouTube Studio",
              "Instagram Insights",
              "TikTok Analytics",
              "Comments (12)",
              "Performance report",
            ].map((tab) => (
              <div className="auto-tab browser-extra-tab" key={tab}>
                {tab}
                <span>×</span>
              </div>
            ))}
          </div>
          <div className="notification-pool">
            {notifications.slice(0, 6).map((item, i) => {
              const Icon =
                item.platform === "youtube"
                  ? Youtube
                  : item.platform === "instagram"
                    ? Instagram
                    : Music2;
              return (
                <div
                  className={`auto-notification chaos-notification notification-${i}`}
                  key={item.title}
                >
                  <span className={`notification-icon ${item.platform}`}>
                    <Icon size={17} />
                  </span>
                  <div>
                    <b>{item.title}</b>
                    <p>{item.detail}</p>
                  </div>
                  <Bell size={12} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="desktop-dock">
          <Youtube />
          <Instagram />
          <Music2 />
          <span>12</span>
        </div>
        <span className="monitor-sample-label">
          Animated creator desktop · Sample account data
        </span>
      </div>
      <LiquidGlass />
      <ProductDemonstration />
      <div className="monitor-application">
        <button className="embedded-return" onClick={onBack}>
          <ArrowLeft size={16} /> Back to the story
        </button>
        <Dashboard demo embedded />
      </div>
    </div>
  );
}
