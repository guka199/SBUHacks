import Link from "next/link";
import { Film, Images } from "lucide-react";

/** Top-of-page choice between analyzing a video and a photo post. */
export function UploadSwitch({ active }: { active: "video" | "post" }) {
  return (
    <nav className="upload-switch" aria-label="What are you posting?">
      <Link
        href="/upload"
        aria-current={active === "video" ? "page" : undefined}
        className={active === "video" ? "active" : ""}
      >
        <Film size={18} /> Video
      </Link>
      <Link
        href="/upload/post"
        aria-current={active === "post" ? "page" : undefined}
        className={active === "post" ? "active" : ""}
      >
        <Images size={18} /> Post
      </Link>
    </nav>
  );
}
