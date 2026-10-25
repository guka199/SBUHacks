import type { VideoMetadata } from "./contracts";
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_THUMBNAILS = 3;
export const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;
export const THUMBNAIL_TYPES = ["image/jpeg", "image/png", "image/webp"];
export function validateThumbnail(
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  if (!THUMBNAIL_TYPES.includes(file.type))
    return `${file.name}: thumbnails must be JPEG, PNG or WebP images.`;
  if (!file.size) return `${file.name} is empty.`;
  if (file.size > MAX_THUMBNAIL_BYTES)
    return `${file.name} is over 10 MB. Export a smaller image.`;
  return null;
}
export function validateVideo(
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  if (!file.size) return "This file is empty. Choose a playable video.";
  if (file.size > MAX_VIDEO_BYTES)
    return "This file is over 200 MB. Export a smaller video and try again.";
  if (
    !/\.(mp4|webm|mov)$/i.test(file.name) ||
    (file.type &&
      !["video/mp4", "video/webm", "video/quicktime"].includes(file.type))
  )
    return "Choose an MP4, WebM, or MOV video.";
  return null;
}
export function readVideo(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const clean = () => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    const timer = setTimeout(() => {
      clean();
      reject(
        new Error(
          "We couldn't read this video. Try an MP4 with H.264 encoding.",
        ),
      );
    }, 12000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const metadata = {
        name: file.name,
        durationSeconds: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      clean();
      if (
        !Number.isFinite(metadata.durationSeconds) ||
        metadata.durationSeconds <= 0 ||
        !metadata.width ||
        !metadata.height
      )
        reject(
          new Error(
            "This video has no readable duration or dimensions. Try another export.",
          ),
        );
      else resolve(metadata);
    };
    video.onerror = () => {
      clean();
      reject(
        new Error(
          "Your browser can't preview this video. Try MP4 (H.264) or WebM.",
        ),
      );
    };
    video.src = url;
  });
}
export function timecode(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
