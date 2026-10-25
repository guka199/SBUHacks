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
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          close();
          document.getElementById("nav-menu-toggle")?.focus();
        }
      }}
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
          <AnimatedLink
            href="/reports"
            aria-current={pathname === "/reports" ? "page" : undefined}
          >
            My reports
          </AnimatedLink>
          <AnimatedLink
            href="/ideas"
            aria-current={pathname === "/ideas" ? "page" : undefined}
          >
            Ideas
          </AnimatedLink>
          <AnimatedLink
            href="/accounts"
            aria-current={pathname === "/accounts" ? "page" : undefined}
          >
            Accounts
          </AnimatedLink>
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
            id="nav-menu-toggle"
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
