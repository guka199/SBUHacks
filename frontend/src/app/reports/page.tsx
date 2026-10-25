"use client";
import Link from "next/link";
import { timecode } from "@/lib/video";
import { formatReportDate } from "@/lib/report-date";
import { ArrowUpRight, FileVideo } from "lucide-react";
import { useEffect, useState } from "react";
import { analysisApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { VideoMetadata } from "@/lib/contracts";

type SavedReport = { id: string; video: VideoMetadata; createdAt: string };
export default function ReportsPage() {
  const { user, loading } = useAuth();
  const [reports, setReports] = useState<SavedReport[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    analysisApi
      .list(controller.signal)
      .then((items) => {
        setReports(items);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load reports");
      });
    return () => controller.abort();
  }, [user, reload]);
  const filtered = reports?.filter((report) =>
    report.video.name
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase().trim()),
  );
  return (
    <section className="account-page page-gutter">
      <div className="product-page-heading">
        <h1>Your reports.</h1>
        <Link className="button button-accent button-small" href="/analyze">
          New video
        </Link>
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
        <div className="error-message" role="alert">
          {error}
          <button
            className="product-button product-secondary"
            onClick={() => {
              setError("");
              setReload((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : reports === null ? (
        <p role="status">Loading reports…</p>
      ) : !reports.length ? (
        <div className="product-empty">
          <FileVideo size={28} aria-hidden="true" />
          <h2>Your next edit starts here.</h2>
          <p>
            Analyze a video to save its feedback, thumbnail comparison, and
            publishing copy.
          </p>
          <Link href="/analyze" className="product-button product-primary">
            Analyze your first video <ArrowUpRight size={17} />
          </Link>
        </div>
      ) : (
        <>
          <label className="form-field report-search">
            Find a report
            <input
              type="search"
              className="account-input"
              placeholder="Search by video name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="saved-reports">
            {filtered?.map((report) => (
              <Link
                className="saved-report"
                href={`/analysis/${report.id}`}
                key={report.id}
              >
                <div>
                  <strong>{report.video.name}</strong>
                  <small>
                    {timecode(report.video.durationSeconds)} ·{" "}
                    {report.video.width} × {report.video.height}
                  </small>
                </div>
                <span>{formatReportDate(report.createdAt)}</span>
              </Link>
            ))}
          </div>
          {!filtered?.length && (
            <p role="status" className="product-empty">
              No reports match: {query}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
