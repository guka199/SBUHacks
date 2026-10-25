"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { analysisApi, type SavedReport } from "@/lib/api";
import { useAuth } from "@/lib/auth";
export default function ReportsPage() {
  const { user, loading } = useAuth();
  const [reports, setReports] = useState<SavedReport[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    analysisApi
      .list(controller.signal)
      .then(setReports)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load reports");
      });
    return () => controller.abort();
  }, [user]);
  return (
    <section className="account-page page-gutter">
      <div className="button-row">
        <h1>Your reports.</h1>
        <div className="button-row">
          <Link className="button button-accent button-small" href="/analyze">
            New video
          </Link>
          <Link
            className="button button-light button-small"
            href="/upload/post"
          >
            New post
          </Link>
        </div>
      </div>
      <p>Saved analyses and publishing copy, available when you come back.</p>
      {loading ? (
        <p role="status">Loading your account…</p>
      ) : !user ? (
        <p>
          <Link href="/login" className="text-link">
            Sign in
          </Link>{" "}
          to see your reports.
        </p>
      ) : error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : reports === null ? (
        <p role="status">Loading reports…</p>
      ) : !reports.length ? (
        <p>No reports yet. Upload your first video or post to get started.</p>
      ) : (
        <div className="saved-reports">
          {reports.map((report) => (
            <Link
              className="saved-report"
              href={
                report.kind === "post"
                  ? `/posts/${report.id}`
                  : `/analysis/${report.id}`
              }
              key={report.id}
            >
              <strong>
                {report.kind === "post" && report.post
                  ? `Post · ${report.post.caption || "Untitled"}${report.post.variants > 1 ? ` · ${report.post.variants} variants` : ""}`
                  : (report.video?.name ?? "Video")}
              </strong>
              <span>
                {new Date(
                  report.createdAt.replace(" ", "T") +
                    (report.createdAt.includes("Z") ? "" : "Z"),
                ).toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
