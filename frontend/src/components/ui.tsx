"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Copy,
  Linkedin,
  Music2,
  Instagram,
  Youtube,
  Play,
  ArrowUpRight,
} from "lucide-react";
import type { PlatformId } from "@/lib/contracts";

export function Mark() {
  return (
    <svg
      width="31"
      height="31"
      viewBox="0 0 192 179"
      fill="none"
      aria-hidden="true"
    >
      {/* Raster inside the existing SVG frame preserves animation selectors. */}
      <image href="/brand/viralpilot-icon.webp" width="192" height="179" />
    </svg>
  );
}
export function PlatformIcon({
  id,
  size = 20,
}: {
  id: PlatformId | "linkedin";
  size?: number;
}) {
  const Icon =
    id === "linkedin"
      ? Linkedin
      : id === "tiktok"
        ? Music2
        : id === "instagram"
          ? Instagram
          : id === "shorts"
            ? Play
            : Youtube;
  return <Icon size={size} aria-hidden="true" strokeWidth={1.7} />;
}
export function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.div>
  );
}
export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [feedback, setFeedback] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Copied");
    } catch {
      setFeedback("Copy unavailable — select the text to copy.");
    }
  }
  return (
    <span className="copy-control">
      <button
        className="icon-button"
        onClick={copy}
        aria-label={feedback === "Copied" ? "Copied to clipboard" : label}
      >
        {feedback === "Copied" ? <Check size={17} /> : <Copy size={17} />}
      </button>
      <span className="copy-feedback" role="status">
        {feedback}
      </span>
    </span>
  );
}
export function Arrow() {
  return <ArrowUpRight size={20} aria-hidden="true" />;
}
