"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, Sparkles } from "lucide-react";
import {
  postPlatforms,
  type PostPlatformId,
  type PostReport,
  type PostVariantResult,
} from "@/lib/contracts";
import { postApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PlatformIcon } from "./ui";

const platformName = (id: PostPlatformId) =>
  postPlatforms.find((p) => p.id === id)!.name;
const verdictLabels = { keep: "Keep", improve: "Improve", cut: "Cut" };

export function PostReportView({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const [report, setReport] = useState<PostReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    postApi
      .get(id, controller.signal)
      .then(setReport)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load report");
      });
    return () => controller.abort();
  }, [id, user]);

  if (loading || (user && !report && !error))
    return (
      <p className="page-gutter studio-page" role="status">
        Loading your report…
      </p>
    );
  if (!user)
    return (
      <p className="page-gutter studio-page">
        <Link href="/login" className="text-link">
          Sign in
        </Link>{" "}
        to see this report.
      </p>
    );
  if (error || !report)
    return (
      <p className="page-gutter studio-page error-message" role="alert">
        {error || "Report not found"}
      </p>
    );
  return <PostStudio report={report} />;
}

function PostStudio({ report }: { report: PostReport }) {
  const [selected, setSelected] = useState(report.picks[0]?.variant ?? 0);
  const many = report.variants.length > 1;
  const src = (variant: number, index: number) =>
    postApi.imageUrl(report.id, variant, index);
  const winsOf = (v: number) =>
    report.picks.filter((p) => p.variant === v).map((p) => p.platform);
  const active = report.variants.find((v) => v.index === selected)!;
  return (
    <div className="studio-page page-gutter post-report">
      <div className="studio-title">
        <div>
          <Link href="/upload/post" className="back-link">
            <ArrowLeft size={15} /> Your studio
          </Link>
          <h1>{many ? "Your posts, compared." : "Your post’s next move."}</h1>
          <p>
            {report.variants.length} variant
            {many ? "s" : ""} · {report.platforms.map(platformName).join(", ")}
          </p>
        </div>
        <div className="button-row">
          <Link
            href="/upload/post"
            className="button button-light button-small"
          >
            New post <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>
      <div className="demo-notice">
        <span className="status-dot" />
        <p>
          <strong>AI-generated estimates.</strong> Use these as creative
          guidance, not predictions of virality.
        </p>
      </div>
      {report.warnings.map((warning) => (
        <p className="error-message" role="status" key={warning}>
          {warning}
        </p>
      ))}
      <div className="insight-takeaway post-summary">
        <Sparkles size={19} />
        <p>{report.summary}</p>
      </div>

      {many && (
        <section aria-labelledby="picks-title" className="post-section">
          <div className="panel-heading">
            <h2 id="picks-title">What to post where.</h2>
            <span>Highest combined score per platform</span>
          </div>
          <ul className="thumbnail-picks">
            {report.picks.map((pick) => (
              <li key={pick.platform}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private, presigned image */}
                <img
                  src={src(pick.variant, 0)}
                  alt={`Variant ${pick.variant + 1} cover`}
                />
                <div>
                  <strong>
                    <PlatformIcon id={pick.platform} />{" "}
                    {platformName(pick.platform)}
                    <span>→ Variant {pick.variant + 1}</span>
                  </strong>
                  <p>{pick.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="variants-title" className="post-section">
        <div className="panel-heading">
          <h2 id="variants-title">
            {many ? "Side by side." : "How it scores."}
          </h2>
          <span>
            Combined model + {report.geminiUsed ? "Gemini" : "no image review"}{" "}
            / 100
          </span>
        </div>
        <div className="variant-cards">
          {report.variants.map((v) => (
            <button
              key={v.index}
              className={`variant-card ${v.index === selected ? "selected" : ""}`}
              aria-pressed={v.index === selected}
              onClick={() => setSelected(v.index)}
            >
              <div className="variant-cover">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, presigned image */}
                <img
                  src={src(v.index, 0)}
                  alt={`Variant ${v.index + 1} cover`}
                />
                <span>
                  {v.images.length} photo{v.images.length === 1 ? "" : "s"}
                </span>
              </div>
              <h3>
                Variant {v.index + 1}
                {many && winsOf(v.index).length > 0 && (
                  <em className="best-label">
                    Best for {winsOf(v.index).map(platformName).join(", ")}
                  </em>
                )}
              </h3>
              <dl className="thumbnail-scores">
                {v.platforms.map((p) => (
                  <div key={p.id} title={p.reason}>
                    <dt>{platformName(p.id)}</dt>
                    <dd>
                      <meter min={0} max={100} value={p.score} />
                      <b>{Math.round(p.score)}</b>
                    </dd>
                  </div>
                ))}
              </dl>
            </button>
          ))}
        </div>
      </section>

      <VariantDetail variant={active} src={src} many={many} />
      <footer className="studio-footer">
        <span>Your creative judgment comes first.</span>
        <span>AI-generated estimates · Not a guarantee of performance</span>
      </footer>
    </div>
  );
}

function VariantDetail({
  variant,
  src,
  many,
}: {
  variant: PostVariantResult;
  src: (variant: number, index: number) => string;
  many: boolean;
}) {
  const note = (index: number) => variant.slides.find((s) => s.index === index);
  const metrics: [string, number | null][] = [
    ["Cover stopping power", variant.hook],
    ["Visual quality", variant.visualQuality],
    ["Clarity", variant.clarity],
  ];
  return (
    <section
      className="post-section variant-detail"
      aria-labelledby="detail-title"
    >
      <div className="panel-heading">
        <h2 id="detail-title">
          {many
            ? `Variant ${variant.index + 1}, slide by slide.`
            : "Slide by slide."}
        </h2>
        <span>{variant.summary}</span>
      </div>
      <div className="metric-group">
        {metrics.map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>
              {value ?? "Unavailable"}
              {value !== null && <span>/100</span>}
            </strong>
            {value !== null && (
              <meter min={0} max={100} value={value} aria-label={label} />
            )}
          </div>
        ))}
      </div>
      <ol className="slide-list">
        {variant.images.map((image) => {
          const slide = note(image.index);
          return (
            <li key={image.index}>
              <div>
                <strong>
                  {image.index === 0 ? "1 · Cover" : `Photo ${image.index + 1}`}
                  {slide && (
                    <em className={`slide-verdict ${slide.verdict}`}>
                      {verdictLabels[slide.verdict]}
                    </em>
                  )}
                </strong>
                <p>{slide?.feedback ?? image.name}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="order-advice">
        <h3>
          {variant.suggestedOrder ? "Try this order" : "Your order works"}
        </h3>
        {variant.suggestedOrder && (
          <ol className="order-strip">
            {variant.suggestedOrder.map((index, position) => (
              <li key={index}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private, presigned image */}
                <img
                  src={src(variant.index, index)}
                  alt={`Photo ${index + 1}`}
                />
                <span>
                  {position + 1}. was photo {index + 1}
                </span>
              </li>
            ))}
          </ol>
        )}
        {variant.orderReason && <p>{variant.orderReason}</p>}
      </div>
      <div className="overall-grid">
        <div>
          <h3>Make it stronger</h3>
          <ol className="overall-list">
            {variant.suggestions.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ol>
        </div>
        <div>
          {variant.strengths.length > 0 && (
            <>
              <h3>What works</h3>
              <ul className="post-strengths">
                {variant.strengths.map((text) => (
                  <li key={text}>
                    <Check size={15} /> {text}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3>Caption</h3>
          <p className="post-caption-text">{variant.caption}</p>
        </div>
      </div>
    </section>
  );
}
