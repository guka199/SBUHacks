import fs from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  meshopt,
  prune,
  textureCompress,
} from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
const files = [
  "public/models/desk.glb",
  "public/assets/hardware/monitor-27.glb",
  "public/assets/hardware/rivet-desk.glb",
  "public/assets/hardware/keyboard.glb",
  "public/assets/hardware/headphones.glb",
  "public/assets/hardware/mouse.glb",
  "public/models/room.glb",
  "public/assets/polyhaven/plant-01.glb",
  "public/assets/polyhaven/plant-02.glb",
  "public/assets/polyhaven/desk-lamp.glb",
];
const report = [];
const sources = JSON.parse(
  await fs.readFile("public/assets/polyhaven/sources.json", "utf8"),
).assets;
const prior = JSON.parse(
  await fs
    .readFile("public/assets/optimization.json", "utf8")
    .catch(() => "[]"),
);
for (const file of files) {
  const before = (await fs.stat(file)).size;
  const document = await io.read(file);
  if (
    document
      .getRoot()
      .listExtensionsUsed()
      .some((e) => e.extensionName === "EXT_meshopt_compression")
  ) {
    const original =
      sources.find((a) => "public" + a.path === file)?.bytes ??
      prior.find((a) => a.file === file)?.before ??
      before;
    report.push({
      file,
      before: original,
      after: before,
      savedPercent: Math.round((1 - before / original) * 100),
    });
    continue;
  }
  await document.transform(
    dedup(),
    prune({ keepAttributes: true }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      quality: 88,
      resize: [1024, 1024],
      slots: /^(?!normalTexture).*$/,
    }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );
  await io.write(file, document);
  const after = (await fs.stat(file)).size;
  report.push({
    file,
    before,
    after,
    savedPercent: Math.round((1 - after / before) * 100),
  });
}
await fs.writeFile(
  "public/assets/optimization.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
