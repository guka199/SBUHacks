"use client";
import Link from "next/link";
import { timecode } from "@/lib/video";
import { formatReportDate } from "@/lib/report-date";
import { ArrowUpRight, FileVideo, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { analysisApi, type SavedReport } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import styles from "./reports.module.css";
export default function ReportsPage() {
  const { user, loading } = useAuth();
  const [reports, setReports] = useState<SavedReport[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  const deleteController = useRef<AbortController | null>(null);
  useEffect(() => () => deleteController.current?.abort(), []);
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
    [report.caption, report.post?.caption, report.video?.name]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase().trim()),
  );
  async function removeReport(report: SavedReport) {
    if (deleteController.current) return;
    const label =
      report.caption ||
      report.post?.caption ||
      report.video?.name ||
      "Untitled";
    if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
    const controller = new AbortController();
    deleteController.current = controller;
    setDeletingId(report.id);
    setDeleteError("");
    setNotice("");
    try {
      const result = await analysisApi.remove(report.id, controller.signal);
      if (!controller.signal.aborted) {
        setReports(
          (current) => current?.filter((item) => item.id !== report.id) ?? null,
        );
        setNotice(result.warning || "Report deleted.");
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setDeleteError(
          cause instanceof Error
            ? cause.message
            : "Could not delete the report. Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) setDeletingId(null);
      if (deleteController.current === controller)
        deleteController.current = null;
    }
  }
  return (
    <section className="account-page page-gutter">
      <div className="product-page-heading">
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
      {deleteError && (
        <p role="alert" className="error-message">
          {deleteError}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
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
            Analyze a video or photo post to save its feedback, comparison, and
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
              <article className={`saved-report ${styles.row}`} key={report.id}>
                <Link
                  className={styles.reportLink}
                  href={
                    report.kind === "post"
                      ? `/posts/${report.id}`
                      : `/analysis/${report.id}`
                  }
                >
                  <div>
                    <strong>
                      {report.caption ||
                        report.post?.caption ||
                        report.video?.name ||
                        "Untitled"}
                    </strong>
                    <small>
                      {report.kind === "post"
                        ? `Post / ${report.post?.images ?? 0} photos / ${report.post?.variants ?? 1} variants`
                        : report.video
                          ? `Video / ${report.video.name} / ${timecode(report.video.durationSeconds)} / ${report.video.width} x ${report.video.height}`
                          : "Video"}
                    </small>
                  </div>
                  <span className={styles.date}>
                    {formatReportDate(report.createdAt)}
                  </span>
                </Link>
                <button
                  type="button"
                  className={styles.deleteButton}
                  aria-label={`Delete report: ${report.caption || report.post?.caption || report.video?.name || "Untitled"}`}
                  title="Delete report"
                  disabled={deletingId !== null}
                  aria-busy={deletingId === report.id}
                  onClick={() => void removeReport(report)}
                >
                  {deletingId === report.id ? (
                    <LoaderCircle
                      size={18}
                      className={styles.spinning}
                      aria-hidden="true"
                    />
                  ) : (
                    <X size={18} aria-hidden="true" />
                  )}
                </button>
              </article>
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
