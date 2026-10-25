import {
  jobSchema,
  rewriteSchema,
  type AnalysisJob,
  type PlatformId,
  type RewriteRequest,
  type VideoMetadata,
} from "./contracts";
export const API_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "false" ||
  (process.env.NEXT_PUBLIC_DEMO_MODE !== "true" &&
    process.env.NEXT_PUBLIC_API_MODE === "live")
    ? "live"
    : process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
        process.env.NEXT_PUBLIC_API_MODE === "demo"
      ? "demo"
      : "live";
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/backend"
).replace(/\/$/, "");

async function jsonRequest(
  path: string,
  signal: AbortSignal,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: body ? "POST" : "GET",
    signal,
    credentials: "include",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      typeof error?.detail === "string"
        ? error.detail
        : `The analysis service returned ${response.status}. Please try again.`,
    );
  }
  return response.json();
}
export const analysisApi = {
  create(
    file: File,
    selected: PlatformId[],
    onProgress: (percent: number) => void,
    signal: AbortSignal,
    metadata: VideoMetadata,
    caption: string,
    thumbnails: File[] = [],
  ): Promise<AnalysisJob> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      const clean = () => signal.removeEventListener("abort", abort);
      xhr.open("POST", `${API_BASE}/api/analyses`);
      xhr.withCredentials = true;
      xhr.timeout = 600000;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        clean();
        if (xhr.status < 200 || xhr.status >= 300) {
          let detail = "";
          try {
            detail = JSON.parse(xhr.responseText).detail;
          } catch {
            /* non-JSON error */
          }
          reject(
            new Error(
              typeof detail === "string" && detail
                ? detail
                : `Upload failed (${xhr.status}). Please try again.`,
            ),
          );
          return;
        }
        try {
          resolve(jobSchema.parse(JSON.parse(xhr.responseText)));
        } catch {
          reject(
            new Error("The server returned an invalid analysis response."),
          );
        }
      };
      xhr.onerror = () => {
        clean();
        reject(
          new Error(
            "Can't reach the analysis service. Check your connection and try again.",
          ),
        );
      };
      xhr.ontimeout = () => {
        clean();
        reject(new Error("Upload timed out. Try a smaller video."));
      };
      xhr.onabort = () => {
        clean();
        reject(new DOMException("Cancelled", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      const form = new FormData();
      form.append("video", file);
      form.append("platforms", JSON.stringify(selected));
      form.append("metadata", JSON.stringify(metadata));
      form.append("caption", caption);
      for (const thumbnail of thumbnails) form.append("thumbnails", thumbnail);
      xhr.send(form);
    });
  },
  async get(id: string, signal: AbortSignal) {
    return jobSchema.parse(
      await jsonRequest(`/api/analyses/${encodeURIComponent(id)}`, signal),
    );
  },
  async list(
    signal: AbortSignal,
  ): Promise<{ id: string; video: VideoMetadata; createdAt: string }[]> {
    return (await jsonRequest("/api/analyses", signal)) as {
      id: string;
      video: VideoMetadata;
      createdAt: string;
    }[];
  },
  videoUrl(id: string) {
    return `${API_BASE}/api/analyses/${encodeURIComponent(id)}/video`;
  },
  thumbnailUrl(id: string, index: number) {
    return `${API_BASE}/api/analyses/${encodeURIComponent(id)}/thumbnails/${index}`;
  },
  async rewrite(id: string, request: RewriteRequest, signal: AbortSignal) {
    return rewriteSchema.parse(
      await jsonRequest(
        `/api/analyses/${encodeURIComponent(id)}/rewrite`,
        signal,
        request,
      ),
    );
  },
};
export function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function waitForAnalysis(
  initial: AnalysisJob,
  signal: AbortSignal,
  onJob: (job: AnalysisJob) => void,
) {
  let job = initial;
  for (let attempts = 0; attempts < 150; attempts++) {
    onJob(job);
    if (job.status === "failed")
      throw new Error(
        job.error || "Analysis failed. Please try another video.",
      );
    if (job.status === "complete" && job.result) return job.result;
    await delay(2000, signal);
    job = await analysisApi.get(job.id, signal);
  }
  throw new Error("Analysis is taking longer than expected. Try again later.");
}
