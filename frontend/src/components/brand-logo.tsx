import Image from "next/image";
import styles from "./brand-logo.module.css";

/** Supplied raster wordmark; keep its original proportions and lettering. */
export function BrandLogo({
  variant = "navigation",
}: {
  variant?: "navigation" | "reveal";
}) {
  return (
    <Image
      src="/brand/viralpilot-wordmark.webp"
      alt="ViralPilot"
      width={914}
      height={271}
      className={`${styles.wordmark} ${variant === "reveal" ? styles.reveal : ""}`}
      preload
      unoptimized
    />
  );
}
