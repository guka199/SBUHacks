"use client";
import {
  Bell,
  ChartNoAxesCombined,
  ChevronDown,
  Command,
  Folder,
  Grid2X2,
  Home,
  Play,
  Search,
  Settings,
  Wifi,
  Youtube,
} from "lucide-react";

// Original illustrative HTML, physically attached to the display with Drei Html.
// Phase two is deliberately calm; the reversible overload timeline comes later.
export function MonitorDesktop() {
  return (
    <div className="monitor-desktop" aria-hidden="true">
      <div className="desktop-menubar">
        <span>
          <Command size={12} /> Creator space
        </span>
        <span>File &nbsp; Edit &nbsp; View</span>
        <span className="desktop-menu-right">
          <Wifi size={12} /> Mon, 9:41 AM
        </span>
      </div>
      <div className="desktop-wallpaper">
        <p>
          A little room
          <br />
          <i>to create.</i>
        </p>
        <span>Good things start with a clear mind.</span>
      </div>
      <div className="calm-analytics">
        <div className="analytics-titlebar">
          <span className="traffic-lights">
            <i />
            <i />
            <i />
          </span>
          <span>Creator analytics</span>
          <Search size={11} />
        </div>
        <div className="analytics-body">
          <aside>
            <span className="youtube-word">
              <Youtube size={17} fill="#d85743" strokeWidth={1.2} /> Studio
            </span>
            <div className="creator-avatar">S</div>
            <b>Studio notes</b>
            <small>Your creative space</small>
            <span className="mini-nav active">
              <Home size={12} /> Overview
            </span>
            <span className="mini-nav">
              <Play size={12} /> Content
            </span>
            <span className="mini-nav">
              <ChartNoAxesCombined size={12} /> Analytics
            </span>
            <span className="mini-nav">
              <Settings size={12} /> Settings
            </span>
          </aside>
          <section>
            <div className="analytics-greeting">
              <h3>Channel overview</h3>
              <Bell size={13} />
            </div>
            <p className="analytics-date">
              Your channel, at a glance{" "}
              <span>
                Last 28 days <ChevronDown size={9} />
              </span>
            </p>
            <div className="analytics-metrics">
              <div>
                <span>Video views</span>
                <strong>24.8K</strong>
                <small>↑ 12% this month</small>
              </div>
              <div>
                <span>Watch time</span>
                <strong>
                  618 <em>hrs</em>
                </strong>
                <small>↑ 8% this month</small>
              </div>
              <div>
                <span>Subscribers</span>
                <strong>+126</strong>
                <small>More people staying</small>
              </div>
            </div>
            <div className="retention-header">
              <b>Audience retention</b>
              <span>One story worth staying for.</span>
            </div>
            <svg className="retention-chart" viewBox="0 0 380 84">
              <path
                d="M0 15H380M0 42H380M0 70H380"
                stroke="#e9eee8"
                fill="none"
              />
              <path
                d="M0 10 30 18 58 19 90 29 120 28 150 34 180 39 215 38 250 43 280 46 310 49 345 51 380 58"
                stroke="#6f9b83"
                strokeWidth="2.5"
                fill="none"
              />
              <text x="0" y="82" fontSize="7" fill="#849188">
                0:00
              </text>
              <text x="360" y="82" fontSize="7" fill="#849188">
                0:24
              </text>
            </svg>
            <div className="latest-video">
              <div className="mini-thumbnail">
                <Play size={13} fill="currentColor" />
              </div>
              <div>
                <b>A little more making.</b>
                <span>Your latest video · Illustrative data</span>
              </div>
              <strong>
                8.2K <small>views</small>
              </strong>
            </div>
          </section>
        </div>
      </div>
      <div className="desktop-dock">
        <div>
          <Grid2X2 size={17} />
        </div>
        <div>
          <Folder size={17} />
        </div>
        <div className="dock-studio">
          <Play size={17} />
        </div>
        <div>
          <ChartNoAxesCombined size={17} />
        </div>
        <div>
          <Settings size={17} />
        </div>
      </div>
    </div>
  );
}
