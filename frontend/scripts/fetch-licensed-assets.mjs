// Download only the named CC0 assets through Poly Haven's documented public API.
// Runtime assets are local: no live API dependency or third-party requests in the app.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";

const destination = path.resolve("public/assets/polyhaven");
await fs.mkdir(destination, { recursive: true });
const manifest = {
  provider: "Poly Haven",
  license: "CC0-1.0",
  licenseUrl: "https://polyhaven.com/license",
  apiTermsUrl: "https://github.com/Poly-Haven/Public-API/blob/master/ToS.md",
  assets: [],
};
try {
  const previous = JSON.parse(
    await fs.readFile(path.join(destination, "sources.json"), "utf8"),
  );
  manifest.assets = previous.assets ?? [];
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
function record(entry) {
  const index = manifest.assets.findIndex((asset) => asset.path === entry.path);
  if (index >= 0) manifest.assets[index] = entry;
  else manifest.assets.push(entry);
}
async function json(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "ViralPilotAssetPreparation/1.0" },
  });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}
async function download(file) {
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`${file.url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (file.md5 && createHash("md5").update(bytes).digest("hex") !== file.md5)
    throw new Error(`Checksum mismatch: ${file.url}`);
  return bytes;
}
function padded(buffer) {
  const out = Buffer.alloc(Math.ceil(buffer.length / 4) * 4);
  buffer.copy(out);
  return out;
}
function boundsFor(gltf) {
  const bounds = new Box3();
  let triangles = 0;
  const visit = (index, parent) => {
    const node = gltf.nodes[index];
    const matrix = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3(...(node.translation ?? [0, 0, 0])),
          new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
          new Vector3(...(node.scale ?? [1, 1, 1])),
        );
    matrix.premultiply(parent);
    if (node.mesh !== undefined)
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const a = gltf.accessors[primitive.attributes.POSITION];
        if (a.min && a.max) {
          const box = new Box3(
            new Vector3(...a.min),
            new Vector3(...a.max),
          ).applyMatrix4(matrix);
          bounds.union(box);
        }
        triangles +=
          gltf.accessors[primitive.indices ?? primitive.attributes.POSITION]
            .count / 3;
      }
    (node.children ?? []).forEach((child) => visit(child, matrix));
  };
  gltf.scenes[gltf.scene ?? 0].nodes.forEach((index) =>
    visit(index, new Matrix4()),
  );
  return {
    min: bounds.min.toArray(),
    max: bounds.max.toArray(),
    size: bounds.getSize(new Vector3()).toArray(),
    triangles: Math.round(triangles),
    upAxis: "Y (glTF)",
    units: "meters",
  };
}
async function model(id, name) {
  const [info, files] = await Promise.all([
    json(`https://api.polyhaven.com/info/${id}`),
    json(`https://api.polyhaven.com/files/${id}`),
  ]);
  const file = files.gltf["1k"].gltf;
  const gltf = JSON.parse((await download(file)).toString("utf8"));
  const included = file.include;
  const chunks = [];
  let offset = 0;
  gltf.bufferViews ??= [];
  const offsets = [];
  for (const buffer of gltf.buffers) {
    offsets.push(offset);
    const bytes = padded(await download(included[buffer.uri]));
    chunks.push(bytes);
    offset += bytes.length;
  }
  gltf.bufferViews.forEach((view) => {
    view.byteOffset = (view.byteOffset ?? 0) + offsets[view.buffer];
    view.buffer = 0;
  });
  for (const image of gltf.images ?? []) {
    if (!image.uri) continue;
    const source = included[image.uri];
    if (!source) throw new Error(`Missing image ${image.uri}`);
    const bytes = await download(source);
    image.bufferView = gltf.bufferViews.length;
    image.mimeType = image.uri.endsWith(".png") ? "image/png" : "image/jpeg";
    delete image.uri;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: bytes.length,
    });
    const pad = padded(bytes);
    chunks.push(pad);
    offset += pad.length;
  }
  gltf.buffers = [{ byteLength: offset }];
  const rawJson = Buffer.from(JSON.stringify(gltf));
  const jsonBytes = Buffer.alloc(Math.ceil(rawJson.length / 4) * 4, 32);
  rawJson.copy(jsonBytes);
  const binary = Buffer.concat(chunks),
    header = Buffer.alloc(12),
    jsonHeader = Buffer.alloc(8),
    binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binary.length, 8);
  jsonHeader.writeUInt32LE(jsonBytes.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const out = Buffer.concat([header, jsonHeader, jsonBytes, binHeader, binary]);
  await fs.writeFile(path.join(destination, name), out);
  const entry = {
    id,
    name: info.name,
    author: Object.keys(info.authors).join(", "),
    source: `https://polyhaven.com/a/${id}`,
    path: `/assets/polyhaven/${name}`,
    bytes: out.length,
    download: file.url,
    sourceMd5: file.md5,
    ...boundsFor(gltf),
  };
  record(entry);
  console.log(entry);
}
await model("potted_plant_01", "plant-01.glb");
await model("potted_plant_02", "plant-02.glb");
await model("desk_lamp_arm_01", "desk-lamp.glb");
for (const [id, type, resolution, format, name] of [
  ["oak_veneer_01", "Diffuse", "1k", "jpg", "oak-color.jpg"],
  ["oak_veneer_01", "nor_gl", "1k", "jpg", "oak-normal.jpg"],
  ["oak_veneer_01", "Rough", "1k", "jpg", "oak-roughness.jpg"],
  ["photo_studio_loft_hall", "hdri", "1k", "hdr", "sunlit-loft.hdr"],
]) {
  const [info, files] = await Promise.all([
    json(`https://api.polyhaven.com/info/${id}`),
    json(`https://api.polyhaven.com/files/${id}`),
  ]);
  const file = files[type][resolution][format];
  const bytes = await download(file);
  await fs.writeFile(path.join(destination, name), bytes);
  record({
    id,
    name: info.name,
    author: Object.keys(info.authors).join(", "),
    source: `https://polyhaven.com/a/${id}`,
    path: `/assets/polyhaven/${name}`,
    map: type,
    resolution,
    bytes: bytes.length,
    download: file.url,
    sourceMd5: file.md5,
  });
  console.log(name, bytes.length);
}
await fs.writeFile(
  path.join(destination, "sources.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await fs.writeFile(
  path.join(destination, "LICENSE.txt"),
  "Poly Haven assets — CC0 1.0 Universal (public domain).\nSource license: https://polyhaven.com/license\nCC0 deed: https://creativecommons.org/publicdomain/zero/1.0/\nPer-asset authors and URLs: sources.json\nModels repackaged from glTF+1K JPEG PBR maps to self-contained GLB. No geometry or material data removed.\n",
);
console.log(
  "Total bytes",
  manifest.assets.reduce((sum, entry) => sum + entry.bytes, 0),
);
