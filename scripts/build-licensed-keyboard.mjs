// Assemble MIT-licensed sculpted keyboard assets by liweihang, with original legends.
import fs from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  copyToDocument,
  dedup,
  instance,
  prune,
} from "@gltf-transform/functions";
import sharp from "sharp";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const dir = "work/assets/keyboard-source";
const layout = JSON.parse(await fs.readFile(dir + "/layout.json", "utf8"));
const doc = await io.read(dir + "/case.glb");
const scene = doc.getRoot().listScenes()[0];
for (const mat of doc.getRoot().listMaterials()) {
  if (/CaseBody|CaseEdge/.test(mat.getName()))
    mat
      .setBaseColorFactor([0.15, 0.22, 0.19, 1])
      .setMetallicFactor(0.8)
      .setRoughnessFactor(0.32);
}
const meshes = new Map();
const keys = layout.rows.flatMap((r) => r.keys);
for (const key of keys) {
  const name = key.rowLevel + "_" + String(key.w).replace(".", "_") + "u";
  if (!meshes.has(name)) {
    const src = await io.read(dir + "/" + name + ".glb");

    const original = src.getRoot().listMeshes()[0];
    const mesh = copyToDocument(doc, src, [original]).get(original);
    mesh
      .listPrimitives()
      .forEach((p) =>
        p
          .getMaterial()
          ?.setBaseColorFactor([0.86, 0.85, 0.79, 1])
          .setRoughnessFactor(0.46)
          .setMetallicFactor(0),
      );
    meshes.set(name, mesh);
  }
  const x = (key.x + key.w / 2 - 8) * 0.01905,
    z = (key.y + key.h / 2 - 2.5) * 0.01905;
  scene.addChild(
    doc
      .createNode(key.keyId)
      .setMesh(meshes.get(name))
      .setTranslation([x, 0, z]),
  );
}
// A single original legend atlas, separate from the licensed geometry.
const w = 0.3178,
  h = 0.109505;
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const text = keys
  .filter((k) => k.keyId !== "KC_SPC")
  .map((k) => {
    const x = (((k.x + k.w / 2 - 8) * 0.01905) / w + 0.5) * 2048,
      y = (((k.y + k.h / 2 - 2.5) * 0.01905) / h + 0.5) * 706;
    const label = k.label.split("\n").at(-1);
    return `<text x="${x}" y="${y + 8}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${label.length > 2 ? 16 : 25}" fill="#354a3d">${escape(label)}</text>`;
  })
  .join("");
const png = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="706">${text}</svg>`,
  ),
)
  .png()
  .toBuffer();
const texture = doc
  .createTexture("Original key legends")
  .setImage(png)
  .setMimeType("image/png");
const material = doc
  .createMaterial("Original printed legends")
  .setBaseColorTexture(texture)
  .setAlphaMode("BLEND")
  .setMetallicFactor(0)
  .setRoughnessFactor(1)
  .setDoubleSided(true);
const buffer = doc.getRoot().listBuffers()[0];
const accessor = (type, values, ArrayType = Float32Array) =>
  doc
    .createAccessor()
    .setType(type)
    .setArray(new ArrayType(values))
    .setBuffer(buffer);
const primitive = doc
  .createPrimitive()
  .setAttribute(
    "POSITION",
    accessor("VEC3", [
      -w / 2,
      0.0103,
      -h / 2,
      w / 2,
      0.0103,
      -h / 2,
      w / 2,
      0.0103,
      h / 2,
      -w / 2,
      0.0103,
      h / 2,
    ]),
  )
  .setAttribute(
    "NORMAL",
    accessor("VEC3", [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  )
  .setAttribute("TEXCOORD_0", accessor("VEC2", [0, 0, 1, 0, 1, 1, 0, 1]))
  .setIndices(accessor("SCALAR", [0, 2, 1, 0, 3, 2], Uint16Array))
  .setMaterial(material);
scene.addChild(
  doc
    .createNode("Printed key legends")
    .setMesh(doc.createMesh().addPrimitive(primitive)),
);
await doc.transform(
  dedup(),
  instance({ min: 2 }),
  prune({ keepAttributes: true }),
);
doc
  .getRoot()
  .listAccessors()
  .forEach((a) => a.setBuffer(buffer));
doc
  .getRoot()
  .listBuffers()
  .filter((b) => b !== buffer)
  .forEach((b) => b.dispose());
await io.write("public/assets/hardware/keyboard.glb", doc);
console.log("Assembled", keys.length, "sculpted keys with shared geometry.");
