// Original parametric models. Rebuild with: node scripts/build-workspace-assets.mjs
// Exports binary glTF without external model or texture licenses.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import fs from "node:fs/promises";

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((value) => {
      this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`;
      this.onloadend?.();
    });
  }
};
await fs.mkdir("public/models", { recursive: true });
await fs.mkdir("public/textures", { recursive: true });
const material = (color, roughness = 0.5, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const oak = material("#bd8655", 0.58);
oak.name = "Oak";
const porcelain = material("#D0311E", 0.22);
const aluminum = material("#a7aba8", 0.3, 0.78);
const black = material("#151a17", 0.55);
const sage = material("#718676", 0.8);
function add(
  parent,
  geometry,
  mat,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  name = "",
) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
const geometryCache = new Map();
function rounded(parent, size, radius, mat, position, rotation, name) {
  const key = JSON.stringify([size, radius]);
  if (!geometryCache.has(key))
    geometryCache.set(key, new RoundedBoxGeometry(...size, 2, radius));
  return add(parent, geometryCache.get(key), mat, position, rotation, name);
}
function tube(parent, points, radius, mat) {
  return add(
    parent,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
      18,
      radius,
      5,
      false,
    ),
    mat,
  );
}
function lathe(parent, profile, mat, position, name = "") {
  return add(
    parent,
    new THREE.LatheGeometry(
      profile.map((p) => new THREE.Vector2(...p)),
      40,
    ),
    mat,
    position,
    [0, 0, 0],
    name,
  );
}
const desk = new THREE.Group();
desk.name = "Original oak desk and creator tools";
rounded(
  desk,
  [4.1, 0.035, 1.45],
  0.13,
  material("#42534a", 0.96),
  [0.35, 0.045, 0.79],
  [0, 0, 0],
  "WoolDeskMat",
);
// Ceramic coffee cup: open lathed walls, visible coffee, glazed rim and handle.
const cup = new THREE.Group();
cup.position.set(-2.35, 0.05, 0.74);
desk.add(cup);
lathe(
  cup,
  [
    [0.001, 0],
    [0.17, 0],
    [0.205, 0.025],
    [0.22, 0.35],
    [0.215, 0.39],
    [0.197, 0.39],
    [0.194, 0.055],
    [0.001, 0.045],
  ],
  porcelain,
  [0, 0, 0],
);
add(
  cup,
  new THREE.CylinderGeometry(0.192, 0.192, 0.009, 40),
  material("#473322", 0.2),
  [0, 0.335, 0],
);
add(
  cup,
  new THREE.TorusGeometry(0.13, 0.034, 12, 36),
  porcelain,
  [0.246, 0.217, 0],
  [0, 0, 0],
);
rounded(
  desk,
  [0.6, 0.028, 0.6],
  0.08,
  material("#a27e58", 0.95),
  [-2.35, 0.022, 0.74],
);
// Headphones on an oak stand, with soft ear cushions and an inset headband.
const headphones = new THREE.Group();
headphones.position.set(2.73, 0.02, -0.04);
headphones.rotation.y = -0.35;
desk.add(headphones);
rounded(
  headphones,
  [0.7, 0.065, 0.5],
  0.16,
  oak,
  [0, 0.02, 0],
  [0, 0, 0],
  "OakHeadphoneBase",
);
rounded(
  headphones,
  [0.12, 1.08, 0.12],
  0.04,
  oak,
  [0, 0.58, 0],
  [0, 0, 0],
  "OakHeadphoneStand",
);
rounded(
  headphones,
  [0.42, 0.1, 0.21],
  0.04,
  oak,
  [0, 1.14, 0],
  [0, 0, 0],
  "OakHeadphoneRest",
);
// Notebook with paper block, cloth cover, elastic and a brass pen.
rounded(
  desk,
  [0.68, 0.07, 0.94],
  0.025,
  material("#D0311E", 0.8),
  [-2.25, 0.06, -0.52],
  [0, 0.14, 0],
);
rounded(
  desk,
  [0.63, 0.048, 0.86],
  0.012,
  material("#F7D87F", 0.8),
  [-2.25, 0.063, -0.52],
  [0, 0.14, 0],
);
add(
  desk,
  new THREE.CylinderGeometry(0.019, 0.019, 0.75, 12),
  material("#aa8c57", 0.3, 0.7),
  [-1.84, 0.09, -0.44],
  [Math.PI / 2, 0, 0.16],
);
// Rounded aluminum mini computer; tiny port detail gives the desk a human scale.
rounded(desk, [0.68, 0.25, 0.68], 0.07, aluminum, [1.66, 0.13, -0.57]);
for (let i = 0; i < 3; i++)
  rounded(desk, [0.08, 0.016, 0.009], 0.005, black, [
    1.47 + i * 0.14,
    0.14,
    -0.224,
  ]);
add(
  desk,
  new THREE.SphereGeometry(0.012, 10, 8),
  material("#bfd4b5"),
  [1.89, 0.09, -0.223],
);
// Cables follow the desk instead of ending abruptly.
tube(
  desk,
  [
    [0, 0.02, -0.65],
    [0.7, 0.025, -0.7],
    [1.1, 0.025, -0.85],
    [1.8, 0.03, -0.9],
  ],
  0.012,
  material("#52564d", 0.8),
);

const room = new THREE.Group();
room.name = "Architectural room and panoramic window";
const plaster = material("#eef0f2", 0.94);
const trim = material("#171717", 0.48, 0.4);
rounded(room, [17, 0.13, 14], 0.02, material("#d9dbdc", 0.85), [0, -3.85, 0]);
rounded(room, [17, 5, 0.27], 0.02, plaster, [0, -2.1, -3.5]);
rounded(room, [17, 2, 0.27], 0.02, plaster, [0, 6.5, -3.5]);
for (const x of [-6.6, 6.6])
  rounded(room, [3.9, 8, 0.27], 0.02, plaster, [x, 2.4, -3.5]);
for (const x of [-4.65, 4.65])
  rounded(room, [0.17, 5.2, 0.27], 0.03, trim, [x, 2.93, -3.29]);
for (const y of [0.32, 5.54])
  rounded(room, [9.5, 0.17, 0.32], 0.03, trim, [0, y, -3.27]);
for (const x of [-1.63, 1.63])
  rounded(room, [0.065, 5.1, 0.13], 0.012, trim, [x, 2.93, -3.22]);
rounded(
  room,
  [9.65, 0.13, 0.62],
  0.045,
  oak,
  [0, 0.18, -3.12],
  [0, 0, 0],
  "OakWindowSill",
);
rounded(
  room,
  [1.6, 0.12, 0.63],
  0.035,
  oak,
  [3.87, 3.1, -2.49],
  [0, 0, 0],
  "OakFloatingShelf",
);
// Framed print on a side wall and a linen curtain at the edge of the panorama.
rounded(
  room,
  [0.85, 1.15, 0.06],
  0.015,
  oak,
  [-5.38, 2.4, -3.3],
  [0, 0, 0],
  "OakPictureFrame",
);
rounded(
  room,
  [0.73, 1.03, 0.01],
  0.005,
  material("#BE1A1A"),
  [-5.38, 2.4, -3.26],
);
add(room, new THREE.CircleGeometry(0.19, 36), sage, [-5.38, 2.5, -3.25]);
const exporter = new GLTFExporter();
for (const [name, group] of [
  ["desk", desk],
  ["room", room],
]) {
  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  const binary = await exporter.parseAsync(group, {
    binary: true,
    onlyVisible: true,
  });
  await fs.writeFile(`public/models/${name}.glb`, Buffer.from(binary));
  console.log(`${name}.glb: ${(binary.byteLength / 1024).toFixed(0)} KB`);
}
