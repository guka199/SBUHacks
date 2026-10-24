// Asset preparation only. The user's photograph is kept separate from the outdoor CC0 plate.
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
const photo = process.argv[2];
const digest = (b) => crypto.createHash("sha256").update(b).digest("hex");
await fs.mkdir("public/assets/scenery", { recursive: true });
const files = await (
  await fetch("https://api.polyhaven.com/files/meadow_2")
).json();
const info = await (
  await fetch("https://api.polyhaven.com/info/meadow_2")
).json();
const source = files.backplates["15"].jpg_pretty;
const response = await fetch(source.url);
if (!response.ok) throw new Error("Scenery download failed");
const raw = Buffer.from(await response.arrayBuffer());
if (crypto.createHash("md5").update(raw).digest("hex") !== source.md5)
  throw new Error("Scenery checksum mismatch");
await sharp(raw)
  .resize({ width: 2560, withoutEnlargement: true })
  .webp({ quality: 88 })
  .toFile("public/assets/scenery/meadow.webp");
const manifest = {
  outdoor: {
    name: "Meadow 2 backplate 15",
    authors: info.authors,
    source: "https://polyhaven.com/a/meadow_2",
    download: source.url,
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    originalSha256: digest(raw),
    changes:
      "Resized to 2560px and WebP encoded. Used on a subdivided outdoor plane with subtle masked foliage displacement.",
  },
};
if (photo) {
  const bytes = await fs.readFile(photo);
  await sharp(bytes)
    .resize({ width: 2560, withoutEnlargement: true })
    .withIccProfile("srgb")
    .webp({ quality: 95, smartSubsample: true })
    .toFile("public/textures/ocean-wallpaper.webp");
  manifest.wallpaper = {
    name: "xxww-KRKW8BKLdrs-unsplash.jpg",
    source: "Exact photograph supplied by the user for the monitor wallpaper",
    originalSha256: digest(bytes),
    originalSize:
      (await sharp(bytes).metadata()).width +
      "x" +
      (await sharp(bytes).metadata()).height,
    changes:
      "ICC-aware sRGB conversion, proportional 2560px resize and high-quality WebP encoding. No retouching or generated replacement. Runtime center-cover crop preserves the horizon and sailboat.",
  };
}
await fs.writeFile(
  "public/assets/scenery/sources.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Prepared separate outdoor and desktop assets.");
