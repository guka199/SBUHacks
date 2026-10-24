"use client";
import { Bell, Instagram, Music2, Youtube } from "lucide-react";
import { AnalyticsWindow } from "./AnalyticsWindow";
import { MonitorDesktop } from "./MonitorDesktop";
import { StudioGateway } from "./StudioGateway";
import { notifications } from "@/lib/experience";
import { LiquidGlass } from "./LiquidGlass";
export function MonitorExperience({ onBack }: { onBack?: () => void }) {
  return (
    <div className="monitor-experience">
      <div className="calm-layer">
        <MonitorDesktop />
      </div>
      <div className="browser-tab-pool">
        {[
          "YouTube Studio",
          "Instagram Insights",
          "TikTok Analytics",
          "Reel comments",
          "Audience retention",
          "New report",
          "Messages (12)",
        ].map((tab, i) => (
          <div className="browser-extra-tab" key={tab}>
            <span>
              {i % 3 === 0 ? (
                <Youtube size={11} />
              ) : i % 3 === 1 ? (
                <Instagram size={11} />
              ) : (
                <Music2 size={11} />
              )}
            </span>
            {tab}
            <span>×</span>
          </div>
        ))}
      </div>
      <div className="window-youtube chaos-window">
        <AnalyticsWindow tool="youtube" />
      </div>
      <div className="window-instagram chaos-window">
        <AnalyticsWindow tool="instagram" />
      </div>
      <div className="window-tiktok chaos-window">
        <AnalyticsWindow tool="tiktok" />
      </div>
      <div className="window-extra-one chaos-window">
        <AnalyticsWindow tool="youtube" extra />
      </div>
      <div className="window-extra-two chaos-window">
        <AnalyticsWindow tool="instagram" extra />
      </div>
      <div className="notification-pool">
        {notifications.map((item, i) => {
          const Icon =
            item.platform === "youtube"
              ? Youtube
              : item.platform === "instagram"
                ? Instagram
                : Music2;
          return (
            <div
              className={`chaos-notification notification-${i}`}
              key={item.title}
            >
              <span className={`notification-icon ${item.platform}`}>
                <Icon size={17} />
              </span>
              <div>
                <b>{item.title}</b>
                <p>{item.detail}</p>
              </div>
              <span className="notification-time">
                {item.time}
                <Bell size={10} />
              </span>
            </div>
          );
        })}
      </div>
      <LiquidGlass />
      <div className="monitor-application">
        <StudioGateway embedded onBack={onBack} />
      </div>
      <div className="monitor-sample-label">
        Illustrative interfaces · Sample account data
      </div>
    </div>
  );
}
