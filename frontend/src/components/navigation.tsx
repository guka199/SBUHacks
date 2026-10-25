"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { Mark } from "./ui";
import { API_MODE } from "@/lib/api";
import { AnimatedLink } from "./ui/animated-link";
import { useAuth } from "@/lib/auth";

export function Navigation() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  if (pathname === "/workspace-preview") return null;
  return (
    <header
      className={`site-header ${pathname === "/" ? "cinematic-header" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <nav className="nav-inner" aria-label="Main navigation">
        <Link className="brand" href="/" onClick={close}>
          <Mark />
          <span>
            viralpilot<span className="brand-dot">®</span>
          </span>
        </Link>
        <div className="desktop-nav">
          <AnimatedLink href="/#story">How it works</AnimatedLink>
          <AnimatedLink href="/dashboard">Dashboard</AnimatedLink>
          <AnimatedLink href="/reports">My reports</AnimatedLink>
          <AnimatedLink href="/ideas">Ideas</AnimatedLink>
          <AnimatedLink href="/accounts">Accounts</AnimatedLink>
        </div>
        <div className="nav-actions">
          <Link
            className="text-link account-nav"
            href={user ? "/settings" : "/login"}
            onClick={close}
          >
            {user ? user.display_name : "Sign in"}
          </Link>
          <span className="mode-indicator">
            <span />
            {pathname === "/demo" || API_MODE === "demo"
              ? "Demo mode"
              : "Live mode"}
          </span>
          <Link
            className="button button-small button-light"
            href="/analyze"
            onClick={close}
          >
            Start creating <ArrowUpRight size={17} />
          </Link>
          <button
            className="menu-button icon-button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </nav>
      {open && (
        <div id="mobile-nav" className="mobile-nav">
          <Link href="/#story" onClick={close}>
            How it works
          </Link>
          <Link href="/studio" onClick={close}>
            Explore the studio
          </Link>
          <Link href="/upload" onClick={close}>
            Analyze your video
          </Link>
          <Link href="/dashboard" onClick={close}>
            Dashboard
          </Link>
          <Link href="/reports" onClick={close}>
            My reports
          </Link>
          <Link href="/ideas" onClick={close}>
            Content ideas
          </Link>
          <Link href="/accounts" onClick={close}>
            Connected accounts
          </Link>
          <Link href={user ? "/settings" : "/login"} onClick={close}>
            {user ? "Settings" : "Sign in"}
          </Link>
        </div>
      )}
    </header>
  );
}
