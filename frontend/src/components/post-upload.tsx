"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ImagePlus,
  Plus,
  X,
} from "lucide-react";
import {
  MAX_POST_IMAGES,
  MAX_POST_VARIANTS,
  postPlatforms,
  type PostPlatformId,
} from "@/lib/contracts";
import { postApi } from "@/lib/api";
import { THUMBNAIL_TYPES, validateThumbnail } from "@/lib/video";
import { useAuth } from "@/lib/auth";
import { PlatformIcon } from "./ui";
import { UploadSwitch } from "./upload-switch";

type Photo = { id: number; file: File; url: string };
type Variant = { id: number; caption: string; photos: Photo[] };

/** Moves one item to a new position (used by drag-and-drop and the arrow buttons). */
export function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function PostUpload() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const nextId = useRef(1);
  const urls = useRef(new Set<string>());
  const [variants, setVariants] = useState<Variant[]>([
    { id: 0, caption: "", photos: [] },
  ]);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<PostPlatformId[]>([
    "instagram",
    "linkedin",
  ]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const created = urls.current;
    return () => {
      controller.current?.abort();
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const variant = variants[active];
  const update = (change: (v: Variant) => Variant) =>
    setVariants((prev) => prev.map((v, i) => (i === active ? change(v) : v)));

  function addPhotos(files: File[]) {
    setError("");
    const room = MAX_POST_IMAGES - variant.photos.length;
    const added: Photo[] = [];
    for (const file of files) {
      const problem = validateThumbnail(file);
      if (problem) {
        setError(problem.replace("thumbnails", "photos"));
        continue;
      }
      if (added.length >= room) {
        setError(`Each variant can have up to ${MAX_POST_IMAGES} photos.`);
        break;
      }
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      added.push({ id: nextId.current++, file, url });
    }
    update((v) => ({ ...v, photos: [...v.photos, ...added] }));
  }
  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.url);
    urls.current.delete(photo.url);
    update((v) => ({
      ...v,
      photos: v.photos.filter((p) => p.id !== photo.id),
    }));
  }
  function reorder(from: number, to: number) {
    if (to < 0 || to >= variant.photos.length || from === to) return;
    update((v) => ({ ...v, photos: move(v.photos, from, to) }));
  }
  function addVariant() {
    if (variants.length >= MAX_POST_VARIANTS) return;
    // A new variant starts with the current caption so small edits are easy to compare.
    setVariants((prev) => [
      ...prev,
      { id: nextId.current++, caption: variant.caption, photos: [] },
    ]);
    setActive(variants.length);
    setError("");
  }
  function removeVariant(index: number) {
    variants[index].photos.forEach((p) => {
      URL.revokeObjectURL(p.url);
      urls.current.delete(p.url);
    });
    setVariants((prev) => prev.filter((_, i) => i !== index));
    setActive((current) =>
      current > index || current === variants.length - 1
        ? Math.max(current - 1, 0)
        : current,
    );
  }
  function drop(event: DragEvent, to: number | null) {
    event.preventDefault();
    setDropping(false);
    if (busy) return;
    if (dragFrom !== null && to !== null) reorder(dragFrom, to);
    else if (event.dataTransfer.files.length)
      addPhotos(Array.from(event.dataTransfer.files));
    setDragFrom(null);
  }

  const missing = variants.findIndex(
    (v) => !v.photos.length || !v.caption.trim(),
  );
  async function analyze() {
    if (busy || !user || !selected.length) return;
    if (missing !== -1) {
      setActive(missing);
      setError(
        `Variant ${missing + 1} needs at least one photo and a caption.`,
      );
      return;
    }
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    setStage("Uploading photos");
    setProgress(0);
    try {
      const report = await postApi.create(
        variants.map((v) => ({
          caption: v.caption.trim(),
          files: v.photos.map((p) => p.file),
        })),
        selected,
        (percent) => {
          setProgress(percent);
          if (percent === 100)
            setStage(
              variants.length > 1
                ? "Comparing your variants… This takes about a minute."
                : "Reviewing your post… This takes about a minute.",
            );
        },
        current.signal,
      );
      router.push(`/posts/${report.id}`);
    } catch (e) {
      if (!current.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Something went wrong. Try again.",
        );
      setBusy(false);
    }
  }

  return (
    <div className="upload-page page-gutter">
      <UploadSwitch active="post" />
      <Link className="back-link" href="/">
        <ArrowLeft size={16} /> Back to home
      </Link>
      <div className="upload-title">
        <h1>
          Line up your
          <br />
          best post.
        </h1>
        <p>
          Add your photos in the order you’ll post them.
          <br />
          Try up to three versions and we’ll compare them.
        </p>
      </div>
      <div className="upload-grid">
        <section className="upload-workspace" aria-label="Post variants">
          <div className="variant-tabs" role="tablist" aria-label="Variants">
            {variants.map((v, i) => (
              <div
                key={v.id}
                className={`variant-tab ${i === active ? "active" : ""}`}
              >
                <button
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => setActive(i)}
                  disabled={busy}
                >
                  Variant {i + 1}
                  <span>
                    {v.photos.length} photo{v.photos.length === 1 ? "" : "s"}
                  </span>
                </button>
                {variants.length > 1 && (
                  <button
                    className="icon-button"
                    aria-label={`Remove variant ${i + 1}`}
                    disabled={busy}
                    onClick={() => removeVariant(i)}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {variants.length < MAX_POST_VARIANTS && (
              <button
                className="variant-add"
                onClick={addVariant}
                disabled={busy}
              >
                <Plus size={16} /> Add variant
              </button>
            )}
          </div>
          <input
            ref={input}
            className="sr-only"
            type="file"
            multiple
            accept={THUMBNAIL_TYPES.join(",")}
            aria-label="Choose photos"
            disabled={busy}
            onChange={(e) => {
              addPhotos(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <div
            className={`photo-board ${dropping ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragFrom === null) setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => drop(e, null)}
          >
            {!variant.photos.length ? (
              <div className="photo-empty">
                <ImagePlus size={30} />
                <h2>Drop your photos here.</h2>
                <p>
                  JPEG, PNG or WebP · up to {MAX_POST_IMAGES} per variant · 10
                  MB each
                </p>
                <button
                  className="button button-light"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  <ImagePlus size={18} /> Browse photos
                </button>
              </div>
            ) : (
              <>
                <p className="photo-hint">
                  Drag to reorder. Photo 1 is the cover people see first.
                </p>
                <ol className="photo-grid">
                  {variant.photos.map((photo, i) => (
                    <li
                      key={photo.id}
                      draggable={!busy}
                      className={dragFrom === i ? "lifted" : ""}
                      onDragStart={(e) => {
                        setDragFrom(i);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragFrom(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.stopPropagation();
                        drop(e, i);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                      <img
                        src={photo.url}
                        alt={`Photo ${i + 1}: ${photo.file.name}`}
                      />
                      <span className="photo-number">
                        {i === 0 ? "1 · Cover" : i + 1}
                      </span>
                      <button
                        className="icon-button photo-remove"
                        aria-label={`Remove photo ${i + 1}`}
                        disabled={busy}
                        onClick={() => removePhoto(photo)}
                      >
                        <X size={14} />
                      </button>
                      <div className="photo-move">
                        <button
                          aria-label={`Move photo ${i + 1} earlier`}
                          disabled={busy || i === 0}
                          onClick={() => reorder(i, i - 1)}
                        >
                          <ArrowLeft size={14} />
                        </button>
                        <button
                          aria-label={`Move photo ${i + 1} later`}
                          disabled={busy || i === variant.photos.length - 1}
                          onClick={() => reorder(i, i + 1)}
                        >
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                  {variant.photos.length < MAX_POST_IMAGES && (
                    <li className="photo-add">
                      <button
                        disabled={busy}
                        onClick={() => input.current?.click()}
                      >
                        <Plus size={22} /> Add photos
                      </button>
                    </li>
                  )}
                </ol>
              </>
            )}
          </div>
          <label className="draft-caption post-caption">
            <span>Caption for variant {active + 1}</span>
            <textarea
              value={variant.caption}
              maxLength={10000}
              rows={4}
              disabled={busy}
              placeholder="What will people read with this post?"
              onChange={(e) =>
                update((v) => ({ ...v, caption: e.target.value }))
              }
            />
          </label>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </section>
        <aside className="upload-settings">
          {!loading && !user && (
            <p className="field-note">
              <Link href="/login">Sign in</Link> or{" "}
              <Link href="/signup">create an account</Link> to analyze and save
              your post.
            </p>
          )}
          <h2>Where’s it going?</h2>
          <p>Choose the platforms you’d like to compare.</p>
          <fieldset className="platform-checks">
            <legend className="sr-only">Target platforms</legend>
            {postPlatforms.map((p) => (
              <label
                key={p.id}
                className={selected.includes(p.id) ? "checked" : ""}
              >
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selected.includes(p.id)}
                  onChange={() =>
                    setSelected((prev) =>
                      prev.includes(p.id)
                        ? prev.filter((id) => id !== p.id)
                        : [...prev, p.id],
                    )
                  }
                />
                <PlatformIcon id={p.id} />
                <span>{p.name}</span>
                <span className="format-label">{p.note}</span>
                <span className="checkbox-mark">
                  {selected.includes(p.id) && <Check size={14} />}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="mode-note">
            <span className="status-dot" />
            <div>
              <strong>
                {variants.length > 1
                  ? `Comparing ${variants.length} variants`
                  : "One variant"}
              </strong>
              <p>
                {variants.length > 1
                  ? "Gemini reviews every variant side by side, so you see which one to post where."
                  : "Add a variant to compare different photos, orders or captions."}
              </p>
            </div>
          </div>
          {busy ? (
            <div className="analysis-progress" aria-live="polite">
              <span>Analysis in progress</span>
              <h3>{stage}</h3>
              <progress
                value={progress < 100 ? progress : undefined}
                max={100}
                aria-label="Post analysis progress"
              />
              <div>
                <span>
                  {progress < 100 ? `${progress}%` : "Photos uploaded"}
                </span>
                <button
                  className="text-link"
                  onClick={() => {
                    controller.current?.abort();
                    setBusy(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="button button-accent full-width"
              disabled={loading || !user || !selected.length}
              onClick={analyze}
            >
              {variants.length > 1 ? "Compare my posts" : "Analyze my post"}
              <ArrowUpRight size={21} />
            </button>
          )}
          {!selected.length && (
            <p role="status" className="field-note">
              Choose at least one platform.
            </p>
          )}
          <p className="privacy-note">
            Your photos and report are saved privately to your account. Gemini
            reviews the uploaded photos.
          </p>
        </aside>
      </div>
    </div>
  );
}
