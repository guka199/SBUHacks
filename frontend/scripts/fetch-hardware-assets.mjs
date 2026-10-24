// Re-download only redistributable source assets. Run optimize:assets afterward.
import fs from "node:fs/promises";
import crypto from "node:crypto";
const output = "public/assets/hardware";
await fs.mkdir(output, { recursive: true });
const assets = [
  {
    file: "monitor-27.glb",
    title: "27 inch monitor",
    author: "Innerscene",
    license: "CC0-1.0",
    source:
      "https://www.innerscene.com/tools/library/3d-parts/27-inch-monitor-office-technology-961fb20e",
    download:
      "https://www.innerscene.com/api/library/27-inch-monitor-office-technology-961fb20e/download",
  },
  {
    file: "mouse.glb",
    title: "Wireless mouse",
    author: "Innerscene",
    license: "CC0-1.0",
    source:
      "https://www.innerscene.com/tools/library/3d-parts/wireless-mouse-office-technology-7e0e880d",
    download:
      "https://www.innerscene.com/api/library/wireless-mouse-office-technology-7e0e880d/download",
  },
  {
    file: "headphones.glb",
    title: "Sony MDR-7506 headphones",
    author: "AndreiVNK",
    license: "CC-BY-4.0",
    source:
      "https://sketchfab.com/3d-models/sony-mdr-7506-headphones-05735b74d3524f00b648231138122a28",
    download: "https://sceneview.github.io/models/platforms/sony_mdr_7506.glb",
    licenseEvidence: "https://sceneview.github.io/credits.html",
  },
  {
    file: "rivet-desk.glb",
    title: "Rivet desk (Amazon Berkeley Objects B07B7DL32P)",
    author: "Amazon.com",
    license: "CC-BY-4.0",
    source:
      "https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/P/B07B7DL32P.glb",
    download:
      "https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/P/B07B7DL32P.glb",
    licenseEvidence: "https://sceneview.github.io/credits.html",
  },
];
async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
const digest = (b) => crypto.createHash("sha256").update(b).digest("hex");
const manifest = [];
for (const a of assets) {
  const b = await download(a.download);
  await fs.writeFile(`${output}/${a.file}`, b);
  manifest.push({
    ...a,
    bytes: b.length,
    originalSha256: digest(b),
    modifications:
      "Scaled/repositioned, Meshopt compressed; suitable textures converted to WebP. Monitor stand material tuned at runtime.",
  });
}
const revision = "330bfe740de931854a8092630ed5364a9273e8a2";
const root = `https://raw.githubusercontent.com/Hanggesimida/keyboard-designer/${revision}/`;
const dir = "work/assets/keyboard-source";
await fs.mkdir(dir, { recursive: true });
const sources = [];
async function keyboardFile(remote, file) {
  const b = await download(root + remote);
  await fs.writeFile(`${dir}/${file}`, b);
  sources.push({
    file,
    source: root + remote,
    sha256: digest(b),
    bytes: b.length,
  });
  return b;
}
const layout = JSON.parse(
  (
    await keyboardFile(
      "apps/web/modules/design/data/layouts/ansi-65.json",
      "layout.json",
    )
  ).toString(),
);
await keyboardFile("apps/web/public/models/cases/ansi-68.glb", "case.glb");
for (const name of new Set(
  layout.rows
    .flatMap((r) => r.keys)
    .map((k) => k.rowLevel + "_" + String(k.w).replace(".", "_") + "u"),
)) {
  await keyboardFile(
    `apps/web/public/models/keycaps/standard/${name}.glb`,
    name + ".glb",
  );
}
await fs.writeFile(
  output + "/KEYBOARD_LICENSE.txt",
  await download(root + "LICENSE"),
);
manifest.push({
  file: "keyboard.glb",
  title: "Keyboard Designer ANSI 65% case and sculpted keycaps",
  author: "liweihang",
  license: "MIT",
  source: "https://github.com/Hanggesimida/keyboard-designer",
  revision,
  sources,
  modifications:
    "68-key assembly with shared instances, forest/cream material palette, original legend atlas, Meshopt compression. Run build:keyboard then optimize:assets.",
});
await fs.writeFile(
  output + "/sources.json",
  JSON.stringify({ checked: "2026-10-24", assets: manifest }, null, 2) + "\n",
);
console.log(
  "Downloaded licensed hardware and pinned keyboard sources. Run npm run build:keyboard && npm run optimize:assets.",
);
