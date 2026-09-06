/* scripts/garment3d.js — the garments, as real geometry.
 *
 * scripts/garment.js draws each piece as layered SVG: a convincing trick, but
 * flat panels on parallel planes. This file replaces that with actual meshes
 * lit in a scene — a torso with a front, a back and two sides, sleeves that are
 * tubes, a hood that is a shell — and wraps the catalogue photograph onto them
 * as cloth. Turning one now turns an object, not a stack of cards.
 *
 * It is an upgrade, never a requirement. garment.js renders first and this
 * module runs after it, replacing the SVG scene inside a stage only once its
 * mesh and its texture are ready. WebGL missing, three.js failing to load, a
 * texture the host will not share cross-origin, a lost context — every one of
 * those leaves the SVG garment exactly where it was, which is why that renderer
 * is still the one every page loads first.
 *
 * How it is put together
 *
 *   loft()      the workhorse: a stack of rings (half-width, half-depth,
 *               roundness, centre offset) smoothed with a Catmull-Rom through
 *               them and skinned. A torso, a sleeve, a trouser leg and a
 *               dress skirt are all this function with different rings.
 *   surface()   a parametric grid for the shapes that are not stacks of rings:
 *               the cap's crown and peak, a hood, a scarf.
 *   SHAPES      one entry per shape key, holding those rings and the trims
 *               (collar, cuffs, hem band, buttons, pockets) that tell a shirt
 *               from a sweatshirt.
 *
 * Which shape a piece is drawn as is NOT decided here: `Threadline.garmentShape`
 * in scripts/garment.js owns that map, so the SVG garment and the mesh can
 * never disagree about what a piece is. Add a garment there, add rings here
 * under the same key.
 *
 * UVs are the interesting part. The image is a flat picture of cloth, and cloth
 * is cut flat and then wrapped, so `u` runs by arc length around each ring
 * rather than by x — no pinching where the surface turns away from the viewer.
 * It runs as a triangle wave, so the whole image lies across the front and
 * again, mirrored, across the back: what an all-over print actually looks like.
 *
 * One WebGLRenderer serves every garment on the page. A browser will only hand
 * out a dozen or so WebGL contexts before it starts throwing the oldest away,
 * and the shop page alone wants thirteen, so the shared renderer draws into its
 * own canvas and each view copies that frame into a plain 2D canvas of its own.
 * Frames are drawn on demand — when a garment is turned, resized or first
 * revealed — never on a loop.
 *
 * Input is not duplicated. garment.js owns the pointer, the drag and the arrow
 * keys, and calls `stage.__garmentTurn(rx, ry)` on every change; this module
 * installs that hook. One input implementation, two renderers.
 *
 * This is a module (three.js ships as ESM), so it is `<script type="module">`
 * and therefore deferred — it always runs after the classic scripts that build
 * window.Threadline. three.js itself is vendored in vendor/, not loaded from a
 * CDN: the README's promise is that serving the folder is enough, and a shop
 * that goes flat when someone else's CDN is unreachable would not keep it.
 */

import * as THREE from "../vendor/three.module.min.js";

const T = (window.Threadline = window.Threadline || {});

/* Rotation the pages ask for, in degrees, is the same range garment.js uses. */
const DEG = Math.PI / 180;

/* ---------------------------------------------------------------------------
   geometry helpers
   ------------------------------------------------------------------------ */

/* A point on a superellipse. `e` is 2 for a true ellipse and rises towards a
   rounded rectangle — a shirt in section is much closer to the latter, being
   wide, shallow and flat across the chest. */
function superPoint(angle, w, d, e) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const p = 2 / e;
  return [
    Math.sign(c) * Math.pow(Math.abs(c), p) * w,
    Math.sign(s) * Math.pow(Math.abs(s), p) * d
  ];
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/* Read one channel of the ring list at parameter t in [0,1], smoothed. The end
   rings are duplicated so the curve starts and finishes exactly on them. */
function sampleRings(rings, key, t) {
  const n = rings.length - 1;
  const x = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(x), n - 1);
  const f = x - i;
  const at = (k) => rings[Math.min(Math.max(k, 0), n)][key] ?? 0;
  return catmull(at(i - 1), at(i), at(i + 1), at(i + 2), f);
}

/* The triangle wave that lays the whole image across the front and again,
   mirrored, across the back. tri(0)=0, tri(1)=1, tri(2)=0. */
function tri(x) {
  const m = ((x % 2) + 2) % 2;
  return 1 - Math.abs(m - 1);
}

/* Skin a stack of rings.

   ring: { y, w, d, e, cx, cz }  — height, half-width, half-depth, roundness
                                   and how far the ring's centre is pushed off
                                   the axis (a trouser leg needs that).
   opts: { rows, cols, vTop, vBottom } */
function loft(rings, opts = {}) {
  const rows = opts.rows ?? 56;
  const cols = opts.cols ?? 64;
  /* Which slice of the picture this stack of rings gets, top and bottom.
     Trousers use it so the print runs on down the legs from the hip instead
     of starting again at the crotch. */
  const vTop = opts.vTop ?? 1;
  const vBottom = opts.vBottom ?? 0;

  const position = [];
  const uv = [];
  const index = [];

  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const y = sampleRings(rings, "y", t);
    const w = sampleRings(rings, "w", t);
    const d = sampleRings(rings, "d", t);
    const e = sampleRings(rings, "e", t) || 2;
    const cx = sampleRings(rings, "cx", t);
    const cz = sampleRings(rings, "cz", t);

    /* Walk the ring once to measure it, so u can run by arc length. */
    const pts = [];
    for (let i = 0; i <= cols; i++) {
      const a = (i / cols) * Math.PI * 2;
      const [px, pz] = superPoint(a, w, d, e);
      pts.push([px + cx, y, pz + cz]);
    }
    const lengths = [0];
    for (let i = 1; i <= cols; i++) {
      const a = pts[i - 1], b = pts[i];
      lengths[i] = lengths[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]);
    }
    const total = lengths[cols] || 1;

    /* v runs from the first ring to the last, so the top of the picture
       lands on the shoulders. */
    const v = vTop + (vBottom - vTop) * t;

    for (let i = 0; i <= cols; i++) {
      position.push(pts[i][0], pts[i][1], pts[i][2]);
      uv.push(tri(2 * (lengths[i] / total)), v);
    }
  }

  /* Wound so the outside of the garment is the front face. Normals come from
     the winding, so getting this backwards turns the cloth inside out: the
     lining would be on the outside and the light would fall on the wrong
     side of every fold. */
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      const b = a + stride;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/* A parametric patch: fn(u, v) returns [x, y, z]. Used for the shapes that are
   not a stack of rings — the cap's peak, a hood, a scarf's drape. */
/* fn(u, v) returns [x, y, z]. `rect` is [u0, v0, uw, vh]: which part of the
   cloth this patch is cut from. Without it a pocket carries a complete copy
   of the photograph, shrunk to pocket size — a whole mountain range on a
   chest pocket — instead of the piece of cloth it is sitting on. */
function surface(fn, cols = 40, rows = 40, rect) {
  const position = [];
  const uv = [];
  const index = [];
  const [u0, v0, uw, vh] = rect || [0, 0, 1, 1];

  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const p = fn(u, v);
      position.push(p[0], p[1], p[2]);
      uv.push(u0 + u * uw, v0 + (1 - v) * vh);
    }
  }
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      const b = a + stride;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------------
   the shapes

   Measurements are in a world where the torso is about two units tall, and the
   camera below is framed to that. Every top is the same list of rings — neck,
   shoulder, chest, waist, hem — with different numbers, exactly as the SVG
   renderer builds every top from one torso function.
   ------------------------------------------------------------------------ */

const TOP_RINGS = [
  /* The neck opening sits barely above the shoulder seam: the first three
     rings are a shoulder with a hole in it, not a chimney. */
  { y: 0.93, w: 0.19, d: 0.15, e: 2.2 },  /* the neck opening */
  { y: 0.90, w: 0.31, d: 0.18, e: 2.4 },
  { y: 0.86, w: 0.60, d: 0.22, e: 2.35 }, /* shoulder */
  { y: 0.52, w: 0.64, d: 0.25, e: 2.45 }, /* chest, under the arm */
  { y: 0.00, w: 0.62, d: 0.24, e: 2.45 }, /* waist */
  { y: -0.62, w: 0.64, d: 0.24, e: 2.45 }, /* hem */
  { y: -0.68, w: 0.61, d: 0.22, e: 2.45 } /* the hem rolling under */
];

function rings(over = {}) {
  return TOP_RINGS.map((r, i) => Object.assign({}, r, over[i] || {}));
}

/* A sleeve, built along its own axis and then swung out from the shoulder. */
const SLEEVE = {
  len: 0.52, angle: 26, tilt: 6,
  top: [0.21, 0.19], end: [0.15, 0.13], drop: 0.05
};

function sleeveSpec(over = {}) { return Object.assign({}, SLEEVE, over); }

const SHAPES = {
  tee: {
    rings: rings(),
    sleeve: sleeveSpec(),
    trims: { neckBand: 0.022, hemStitch: true }
  },

  longsleeve: {
    rings: rings({ 3: { w: 0.58, d: 0.22 }, 4: { w: 0.55, d: 0.21 }, 5: { w: 0.57, d: 0.21 }, 6: { w: 0.54, d: 0.20 } }),
    sleeve: sleeveSpec({ len: 1.02, angle: 20, end: [0.11, 0.10] }),
    trims: { neckBand: 0.02, cuffBand: true, hemBand: true, rib: true }
  },

  knit: {
    rings: rings({ 0: { w: 0.22, d: 0.17 } }),
    sleeve: sleeveSpec({ len: 1.06, angle: 22, end: [0.13, 0.12] }),
    trims: { neckBand: 0.038, cuffBand: true, hemBand: true, rib: true }
  },

  hoodie: {
    rings: rings({ 2: { w: 0.63 }, 3: { w: 0.69, d: 0.27 }, 4: { w: 0.67, d: 0.26 }, 5: { w: 0.69, d: 0.26 }, 6: { w: 0.66, d: 0.24 } }),
    sleeve: sleeveSpec({ len: 1.04, angle: 21, top: [0.23, 0.21], end: [0.14, 0.13] }),
    trims: { hood: true, drawcord: true, pouch: true, cuffBand: true, hemBand: true }
  },

  shirt: {
    rings: rings({ 0: { w: 0.17, d: 0.14 }, 5: { y: -0.60 }, 6: { y: -0.66 } }),
    sleeve: sleeveSpec({ len: 1.00, angle: 20, end: [0.12, 0.11] }),
    trims: { collar: true, placket: true, buttons: 5, chestPocket: true, cuffBand: true }
  },

  overshirt: {
    rings: rings({ 0: { w: 0.18, d: 0.15 }, 2: { w: 0.64 }, 3: { w: 0.70, d: 0.28 }, 4: { w: 0.69, d: 0.27 }, 5: { w: 0.71, d: 0.27 }, 6: { w: 0.68, d: 0.25 } }),
    sleeve: sleeveSpec({ len: 1.02, angle: 21, top: [0.23, 0.21], end: [0.14, 0.13] }),
    trims: { collar: true, placket: true, buttons: 4, patchPockets: true, cuffBand: true }
  },

  jacket: {
    rings: rings({
      0: { w: 0.18, d: 0.15 }, 2: { w: 0.63 }, 3: { w: 0.68, d: 0.27 },
      4: { y: -0.10, w: 0.66, d: 0.26 }, 5: { y: -0.40, w: 0.62, d: 0.24 }, 6: { y: -0.46, w: 0.60, d: 0.23 }
    }),
    sleeve: sleeveSpec({ len: 0.96, angle: 21, top: [0.22, 0.20], end: [0.14, 0.12] }),
    trims: { collar: true, placket: true, buttons: 4, yoke: true, flapPockets: true, cuffBand: true, waistBand: -0.40 }
  },

  dress: {
    rings: [
      { y: 1.00, w: 0.20, d: 0.16, e: 2.2 },
      { y: 0.94, w: 0.33, d: 0.19, e: 2.4 },
      { y: 0.86, w: 0.52, d: 0.20, e: 2.6 },
      { y: 0.52, w: 0.54, d: 0.22, e: 2.8 },
      { y: 0.10, w: 0.52, d: 0.21, e: 2.8 },
      { y: -0.45, w: 0.72, d: 0.30, e: 2.6 },
      { y: -1.02, w: 0.92, d: 0.40, e: 2.4 },
      { y: -1.08, w: 0.88, d: 0.38, e: 2.4 }
    ],
    sleeve: sleeveSpec({ len: 0.30, angle: 40, top: [0.18, 0.16], end: [0.16, 0.14] }),
    trims: { neckBand: 0.018, waistSeam: 0.10 }
  },

  pant: {
    pant: {
      hip: [
        { y: 1.00, w: 0.46, d: 0.26, e: 2.8 },
        { y: 0.86, w: 0.48, d: 0.27, e: 2.9 },
        { y: 0.52, w: 0.50, d: 0.28, e: 2.9 },
        { y: 0.30, w: 0.49, d: 0.27, e: 2.9 }
      ],
      leg: [
        { y: 0.34, w: 0.25, d: 0.24, e: 2.6, cx: 0.23 },
        { y: -0.10, w: 0.22, d: 0.21, e: 2.5, cx: 0.24 },
        { y: -0.62, w: 0.18, d: 0.17, e: 2.4, cx: 0.23 },
        { y: -1.04, w: 0.15, d: 0.14, e: 2.3, cx: 0.21 },
        { y: -1.09, w: 0.14, d: 0.13, e: 2.3, cx: 0.21 }
      ]
    },
    trims: { waistBand: 0.92, fly: true }
  },

  cap: { cap: true },
  scarf: { scarf: true }
};

/* ---------------------------------------------------------------------------
   materials and light
   ------------------------------------------------------------------------ */

/* A woven normal map, drawn once and shared: warp and weft at a few pixels, so
   the cloth catches the key light the way fabric does instead of reading as
   painted plastic. */
let weaveMap = null;
function weave() {
  if (weaveMap) return weaveMap;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      /* Two out-of-phase ripples plus a little noise: a plain weave. */
      const warp = Math.sin(x * Math.PI / 2) * 26;
      const weft = Math.sin(y * Math.PI / 2) * 26;
      const n = (Math.random() - 0.5) * 12;
      img.data[i] = 128 + warp + n;
      img.data[i + 1] = 128 + weft + n;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  weaveMap = new THREE.CanvasTexture(c);
  weaveMap.wrapS = weaveMap.wrapT = THREE.RepeatWrapping;
  weaveMap.repeat.set(10, 12);
  return weaveMap;
}

/* The studio: a soft gradient used as the environment, so the standard material
   has something to reflect and the shaded side of a garment is not simply
   black. Built from a canvas — no HDR file to ship. */
let envMap = null;
function studioEnv(renderer) {
  if (envMap) return envMap;
  const c = document.createElement("canvas");
  c.width = 32; c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, "#c9cee0");
  g.addColorStop(0.72, "#6f7488");
  g.addColorStop(1, "#2a2d38");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  envMap = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return envMap;
}

/* Textures are cached by URL: the related-products grid on a product page can
   ask for the same photograph the hero is already wearing. */
const textures = new Map();
function loadTexture(url) {
  if (textures.has(url)) return textures.get(url);
  const p = new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      resolve(tex);
    }, undefined, () => reject(new Error("texture")));
  });
  textures.set(url, p);
  return p;
}

function fabricMaterial(tex, tint, side) {
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: tint || 0xffffff,
    roughness: 0.94,
    metalness: 0.0,
    normalMap: weave(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    side: side || THREE.DoubleSide
  });
}

/* The inside of the garment. A body is an open tube: without this you look
   straight through the neck at the lit inside of the far wall, and the neck
   opening reads as a shelf instead of a hole. The lining is the same surface
   drawn back-face only, in shadow, which is what the inside of a shirt looks
   like — and it is why the cloth itself is front-face only. */
function liningMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x23262f,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.BackSide
  });
}

/* Cloth and its lining, from one geometry. */
function addCloth(group, geo, mat, lining) {
  group.add(new THREE.Mesh(geo, mat));
  if (lining) group.add(new THREE.Mesh(geo, lining));
}

/* ---------------------------------------------------------------------------
   building one garment
   ------------------------------------------------------------------------ */

function addSleeves(group, spec, mat, trimMat, lining) {
  const s = spec.sleeve;
  if (!s) return;
  const shoulder = spec.rings[2];

  for (const side of [-1, 1]) {
    /* Built straight down its own axis, then swung out and tipped forward. */
    /* The first two rings dome the sleeve head shut and sit inside the body.
       An open-ended tube left its rim showing as a hard line straight across
       the shoulder, because the sleeve is wider than the torso up there. */
    const sleeveRings = [
      { y: 0.14, w: s.top[0] * 0.30, d: s.top[1] * 0.30, e: 2.2 },
      { y: 0.09, w: s.top[0] * 0.82, d: s.top[1] * 0.82, e: 2.3 },
      { y: 0.02, w: s.top[0], d: s.top[1], e: 2.4 },
      { y: -s.len * 0.45, w: (s.top[0] + s.end[0]) * 0.52, d: (s.top[1] + s.end[1]) * 0.52, e: 2.3 },
      { y: -s.len, w: s.end[0], d: s.end[1], e: 2.2 },
      { y: -s.len - 0.03, w: s.end[0] * 0.92, d: s.end[1] * 0.92, e: 2.2 }
    ];
    const sleeveGeo = loft(sleeveRings, { rows: 30, cols: 40 });
    const mesh = new THREE.Mesh(sleeveGeo, mat);
    mesh.rotation.z = side * s.angle * DEG;
    mesh.rotation.x = -s.tilt * DEG;
    /* Seated a little inside the torso, so the two surfaces meet with no gap
       however the scene is turned. */
    mesh.position.set(side * (shoulder.w - 0.19), shoulder.y - 0.11, 0.01);
    group.add(mesh);
    if (lining) {
      const inner = new THREE.Mesh(sleeveGeo, lining);
      inner.rotation.copy(mesh.rotation);
      inner.position.copy(mesh.position);
      group.add(inner);
    }

    if (spec.trims && spec.trims.cuffBand) {
      const cuff = new THREE.Mesh(loft([
        { y: -s.len + 0.02, w: s.end[0] * 1.05, d: s.end[1] * 1.05, e: 2.2 },
        { y: -s.len - 0.06, w: s.end[0] * 1.02, d: s.end[1] * 1.02, e: 2.2 }
      ], { rows: 6, cols: 40 }), trimMat);
      cuff.rotation.copy(mesh.rotation);
      cuff.position.copy(mesh.position);
      group.add(cuff);
    }
  }
}

/* A band wrapped round the body at a height — the rib at a hem, the collar
   stand at a neck, a jacket's waistband. */
function bandAt(spec, y, thickness, grow) {
  const at = (key, yy) => {
    /* Find the ring parameter closest to this height and read the section. */
    let best = 0, bestD = Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const ry = sampleRings(spec.rings, "y", t);
      const dd = Math.abs(ry - yy);
      if (dd < bestD) { bestD = dd; best = t; }
    }
    return sampleRings(spec.rings, key, best);
  };
  const w = at("w", y) * (grow ?? 1.02);
  const d = at("d", y) * (grow ?? 1.02);
  const e = at("e", y) || 2.8;
  /* Rolled at both edges rather than cut off square. An open cylinder shows
     its rim, and a rim seen edge-on catches the key light as a hard bright
     line — which is what made a neck rib read as a metal ring. */
  return loft([
    { y: y + thickness / 2 + 0.012, w: w * 0.965, d: d * 0.965, e },
    { y: y + thickness / 2, w, d, e },
    { y: y - thickness / 2, w: w * 0.995, d: d * 0.995, e },
    { y: y - thickness / 2 - 0.012, w: w * 0.96, d: d * 0.96, e }
  ], { rows: 12, cols: 56 });
}

function buildTop(spec, mat, trimMat, buttonMat, lining) {
  const group = new THREE.Group();
  const trims = spec.trims || {};

  addCloth(group, loft(spec.rings, { rows: 64, cols: 72 }), mat, lining);
  addSleeves(group, spec, mat, trimMat, lining);

  const neck = spec.rings[0];
  const hem = spec.rings[spec.rings.length - 2];

  if (trims.neckBand) {
    group.add(new THREE.Mesh(bandAt(spec, neck.y - 0.01, trims.neckBand, 1.10), trimMat));
  }

  if (trims.hemBand) {
    group.add(new THREE.Mesh(bandAt(spec, hem.y + 0.05, 0.10, 1.015), trimMat));
  } else if (trims.hemStitch) {
    group.add(new THREE.Mesh(bandAt(spec, hem.y + 0.04, 0.02, 1.008), trimMat));
  }

  if (trims.waistBand != null) {
    group.add(new THREE.Mesh(bandAt(spec, trims.waistBand + 0.05, 0.10, 1.015), trimMat));
  }

  if (trims.waistSeam != null) {
    group.add(new THREE.Mesh(bandAt(spec, trims.waistSeam, 0.014, 1.006), trimMat));
  }

  if (trims.yoke) {
    group.add(new THREE.Mesh(bandAt(spec, 0.50, 0.014, 1.006), trimMat));
  }

  /* A collar: a band round the neck with two points falling onto the chest. */
  if (trims.collar) {
    const stand = new THREE.Mesh(bandAt(spec, neck.y - 0.015, 0.055, 1.18), trimMat);
    group.add(stand);
    for (const side of [-1, 1]) {
      /* u runs along the collar from the centre front out towards the
         shoulder; v runs across the leaf from its fold at the stand to its
         free edge, which is the point that hangs on the chest. z is read
         off the body at that height, so the collar lies on whatever it is
         sewn to rather than sinking into it. */
      const leaf = new THREE.Mesh(surface((u, v) => {
        const foldX = side * (0.04 + u * 0.15);
        const foldY = neck.y - 0.02 + u * 0.02;
        const edgeX = side * (0.11 + u * 0.16);
        const edgeY = neck.y - 0.30 + u * 0.15;
        const x = foldX + (edgeX - foldX) * v;
        const y = foldY + (edgeY - foldY) * v;
        return [x, y, frontAt(spec, y) + 0.032 - v * 0.006];
      }, 14, 14, bodyUVRect(spec, side * 0.14, neck.y - 0.14, 0.28, 0.30)), trimMat);
      group.add(leaf);
    }
  }

  /* The placket, raised a hair off the chest so it catches the light. */
  if (trims.placket) {
    const top = neck.y - 0.06;
    const bottom = hem.y + 0.06;
    group.add(new THREE.Mesh(surface((u, v) => {
      const x = (u - 0.5) * 0.10;
      const y = top + (bottom - top) * v;
      /* Standing a few millimetres off the chest, following its barrel. */
      return [x, y, frontAt(spec, y) + 0.010];
    }, 8, 28, bodyUVRect(spec, 0, (top + bottom) / 2, 0.10, bottom - top)), trimMat));
  }

  if (trims.buttons) {
    const top = neck.y - 0.16;
    const bottom = hem.y + 0.16;
    const geo = new THREE.CylinderGeometry(0.022, 0.022, 0.012, 16);
    for (let i = 0; i < trims.buttons; i++) {
      const y = top + (bottom - top) * (i / Math.max(trims.buttons - 1, 1));
      const b = new THREE.Mesh(geo, buttonMat);
      b.rotation.x = Math.PI / 2;
      b.position.set(0, y, frontAt(spec, y) + 0.022);
      group.add(b);
    }
  }

  if (trims.chestPocket) group.add(patch(spec, trimMat, -0.26, 0.34, 0.20, 0.20));
  if (trims.patchPockets) {
    group.add(patch(spec, trimMat, -0.30, 0.08, 0.26, 0.26));
    group.add(patch(spec, trimMat, 0.30, 0.08, 0.26, 0.26));
  }
  if (trims.flapPockets) {
    group.add(patch(spec, trimMat, -0.26, 0.34, 0.22, 0.10));
    group.add(patch(spec, trimMat, 0.26, 0.34, 0.22, 0.10));
  }
  if (trims.pouch) group.add(patch(spec, trimMat, 0, -0.32, 0.72, 0.30));

  /* The hood sits behind the shoulders and shows above the neckline. */
  if (trims.hood) {
    /* Part of an ellipsoid, centred behind the neck and swept from the back
       round to the sides: the shell of a hood lying down between the
       shoulders. u goes round it, v climbs from the shoulder seam to the
       crown. */
    const cy = neck.y - 0.14, cz = -0.10;
    const rx = 0.40, ry = 0.27, rz = 0.32;
    const hood = new THREE.Mesh(surface((u, v) => {
      const a = (u - 0.5) * Math.PI * 1.28;
      const climb = v * Math.PI * 0.5;
      const ring = Math.cos(climb * 0.92);
      return [
        rx * ring * Math.sin(a),
        cy + ry * Math.sin(climb),
        cz - rz * ring * Math.cos(a)
      ];
    }, 36, 22, bodyUVRect(spec, 0, neck.y - 0.30, 0.8, 0.5)), mat);
    group.add(hood);
    if (lining) group.add(new THREE.Mesh(hood.geometry, lining));
  }

  if (trims.drawcord) {
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 0.34, 8);
    for (const side of [-1, 1]) {
      const cord = new THREE.Mesh(geo, buttonMat);
      cord.position.set(side * 0.09, neck.y - 0.22, frontAt(spec, neck.y - 0.22) + 0.02);
      cord.rotation.z = side * 3 * DEG;
      group.add(cord);
    }
  }

  return group;
}

/* How far forward the body's surface is at a given height — where a button, a
   cord or a pocket has to sit so it lies on the cloth rather than in it. */
function frontAt(spec, y) {
  let best = 0, bestD = Infinity;
  for (let t = 0; t <= 1; t += 0.01) {
    const ry = sampleRings(spec.rings, "y", t);
    const dd = Math.abs(ry - y);
    if (dd < bestD) { bestD = dd; best = t; }
  }
  return sampleRings(spec.rings, "d", best);
}

/* Where a point on the body falls on the picture. The loft lays the whole
   image across the front by arc length, so this is the same idea read
   backwards, close enough for a trim: across is x over the widest ring, down
   is y over the garment's height. A patch cut with these UVs continues the
   cloth it is sewn to rather than starting the picture again. */
function bodyUVRect(spec, cx, cy, w, h) {
  const list = spec.rings;
  const topY = list[0].y;
  const botY = list[list.length - 1].y;
  const maxW = list.reduce((m, r) => Math.max(m, r.w), 0.001);
  const span = (topY - botY) || 1;
  return [
    0.5 + (cx - w / 2) / (2 * maxW),
    (cy - h / 2 - botY) / span,
    w / (2 * maxW),
    h / span
  ];
}

/* A pocket: a small panel bent to follow the chest it is sewn to. */
function patch(spec, mat, cx, cy, w, h) {
  return new THREE.Mesh(surface((u, v) => {
    const x = cx + (u - 0.5) * w;
    const y = cy + (0.5 - v) * h;
    const d = frontAt(spec, y);
    /* Follow the barrel of the body, standing 8mm proud of it. */
    const z = Math.sqrt(Math.max(1 - Math.pow(Math.min(Math.abs(x) / 0.66, 1), 2.6), 0)) * d + 0.008;
    return [x, y, z];
  }, 10, 10, bodyUVRect(spec, cx, cy, w, h)), mat);
}

function buildPant(spec, mat, trimMat, lining) {
  const group = new THREE.Group();
  addCloth(group, loft(spec.pant.hip, { rows: 26, cols: 56, vTop: 1, vBottom: 0.62 }), mat, lining);
  for (const side of [-1, 1]) {
    const legRings = spec.pant.leg.map((r) => Object.assign({}, r, { cx: side * r.cx }));
    addCloth(group, loft(legRings, { rows: 40, cols: 40, vTop: 0.62, vBottom: 0 }), mat, lining);
  }
  /* The waistband, and the fly that makes a tube read as a trouser. */
  const band = loft([
    { y: 1.02, w: 0.47, d: 0.265, e: 2.8 },
    { y: 0.88, w: 0.485, d: 0.275, e: 2.9 }
  ], { rows: 6, cols: 56 });
  group.add(new THREE.Mesh(band, trimMat));
  const fly = new THREE.Mesh(surface((u, v) => {
    const x = 0.02 + (u - 0.5) * 0.05;
    const y = 0.88 - v * 0.42;
    return [x, y, 0.27 + 0.004];
  }, 6, 12), trimMat);
  group.add(fly);
  return group;
}

function buildCap(mat, trimMat, lining) {
  const group = new THREE.Group();

  /* The crown: a six-panel dome, a shade taller at the front. */
  const crown = new THREE.Mesh(surface((u, v) => {
    const a = u * Math.PI * 2;
    const t = v * Math.PI * 0.5;
    const r = 0.62 * Math.cos(t * 0.94);
    return [Math.cos(a) * r, 0.05 + Math.sin(t) * 0.62, Math.sin(a) * r * 0.94];
  }, 48, 24), mat);
  group.add(crown);
  if (lining) group.add(new THREE.Mesh(crown.geometry, lining));

  /* The peak: a narrow tongue leaving the head line at the front and curving
     down and away. Swept any wider it stops being a peak and becomes a brim
     all the way round, which is a sun hat, not a six-panel cap. */
  const peak = new THREE.Mesh(surface((u, v) => {
    const a = (u - 0.5) * Math.PI * 0.62;
    const reach = 0.56 + v * 0.46;
    return [Math.sin(a) * reach * 0.92, 0.05 - v * v * 0.17, Math.cos(a) * reach];
  }, 28, 12), trimMat);
  group.add(peak);

  /* The sweatband where the crown meets the peak — the same size as the
     crown, so it is a band and not a rim standing out from it. */
  group.add(new THREE.Mesh(loft([
    { y: 0.10, w: 0.625, d: 0.592, e: 2.1 },
    { y: 0.01, w: 0.618, d: 0.585, e: 2.1 },
    { y: -0.02, w: 0.60, d: 0.57, e: 2.1 }
  ], { rows: 8, cols: 48 }), trimMat));

  /* A cap is photographed three-quarter on, never square to the lens: from
     dead in front its peak points at the viewer and disappears. */
  group.rotation.y = -0.62;

  return group;
}

function buildScarf(mat) {
  const group = new THREE.Group();
  /* Two panels falling from a loop behind the neck, drawn as one ribbon that
     is wide, thin and gently rippled — a scarf hanging, not a flat plank. */
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(surface((u, v) => {
      const x = side * 0.24 + (u - 0.5) * 0.30;
      const y = 0.90 - v * 1.90;
      /* A slow S through the depth, and a ripple across the width. */
      const z = Math.sin(v * 2.6) * 0.13 + Math.sin(u * Math.PI * 3 + v * 4) * 0.022 + 0.06;
      return [x + Math.sin(v * 2.2) * side * 0.05, y, z];
    }, 16, 40), mat);
    group.add(panel);
  }
  /* The loop across the back of the neck. */
  group.add(new THREE.Mesh(surface((u, v) => {
    const a = Math.PI * (0.05 + u * 0.90);
    const r = 0.30;
    return [Math.cos(a) * -r * 1.1, 0.92 + (v - 0.5) * 0.26, -Math.sin(a) * r * 0.7 - 0.02];
  }, 24, 8), mat));
  return group;
}

function buildGarment(shapeKey, tex) {
  const spec = SHAPES[shapeKey] || SHAPES.tee;
  const mat = fabricMaterial(tex, null, THREE.FrontSide);
  const lining = liningMaterial();
  /* Trims are the same cloth, a touch darker, so a collar and a cuff read as
     separate pieces without inventing a colour the garment does not have. */
  const trimMat = fabricMaterial(tex, 0xd6dae4);
  const buttonMat = new THREE.MeshStandardMaterial({
    color: 0xefe9dc, roughness: 0.42, metalness: 0.05
  });

  let group;
  if (spec.cap) group = buildCap(mat, trimMat, lining);
  else if (spec.scarf) group = buildScarf(mat);
  else if (spec.pant) group = buildPant(spec, mat, trimMat, lining);
  else group = buildTop(spec, mat, trimMat, buttonMat, lining);

  group.userData.materials = [mat, trimMat, buttonMat, lining];
  return group;
}

/* ---------------------------------------------------------------------------
   the shared renderer

   One WebGL context for the whole page. Each view owns a plain 2D canvas and
   receives a copy of the frame, because a browser hands out roughly a dozen
   contexts before it starts discarding the oldest — and the shop page wants
   thirteen garments at once.
   ------------------------------------------------------------------------ */

let renderer = null;
let rendererBroken = false;

function getRenderer() {
  if (renderer || rendererBroken) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      /* The frame is copied out with drawImage immediately after it is drawn;
         keeping the buffer makes that reliable across browsers. */
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      rendererBroken = true;
      views.forEach((v) => v.giveUp());
    });
  } catch (err) {
    rendererBroken = true;
    renderer = null;
  }
  return renderer;
}

const views = new Set();

/* Frames are drawn only when something changed. */
let frameQueued = false;
function schedule() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(drawDirtyViews);
}

function drawDirtyViews() {
  frameQueued = false;
  const r = getRenderer();
  if (!r) return;
  let again = false;
  views.forEach((v) => {
    if (v.dirty) { v.draw(r); }
    if (v.settling) again = true;
  });
  if (again) schedule();
}

/* ---------------------------------------------------------------------------
   one view: a stage upgraded from SVG to a mesh
   ------------------------------------------------------------------------ */

class GarmentView {
  constructor(stage, product) {
    this.stage = stage;
    this.product = product;
    this.dirty = false;
    this.settling = false;
    this.dead = false;

    /* Where the frames land. The SVG scene stays in the DOM underneath until
       the first frame is drawn, so nothing ever flashes empty. */
    this.canvas = document.createElement("canvas");
    this.canvas.className = "g3d-gl";
    this.ctx = this.canvas.getContext("2d");

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    /* Where the garment is being turned to, and where it is now: the scene
       eases towards the target so a flick of the pointer is not a jump. */
    this.target = { x: 0, y: 0 };
    this.current = { x: 0, y: 0 };
  }

  async build() {
    const r = getRenderer();
    if (!r) throw new Error("no-webgl");

    const tex = await loadTexture(this.product.image);
    if (this.dead) return;

    const shape = (T.garmentShape ? T.garmentShape(this.product) : "tee");
    this.garment = buildGarment(shape, tex);
    this.pivot.add(this.garment);

    this.scene.environment = studioEnv(r);

    /* Key, fill and rim: enough to give the cloth a lit side, a shaded side
       and an edge that separates it from the studio behind. */
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-1.6, 2.2, 3.0);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe6ff, 0.6);
    fill.position.set(2.4, 0.4, 1.6);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xbfc8ff, 1.1);
    rim.position.set(0.6, 1.2, -3.0);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xdfe4ff, 0x2b2f3a, 0.85));

    this.frame();
    this.attach();
    this.markDirty();
  }

  /* Measure the garment once and hang the pivot on its middle, so turning it
     turns it about itself rather than swinging it round the world origin. */
  frame() {
    const box = new THREE.Box3().setFromObject(this.garment);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    this.garment.position.sub(centre);
    this.halfH = size.y / 2;
    /* Worst case across: a garment turned side-on is as wide as it is deep,
       so reserve room for whichever is larger and it never clips mid-turn. */
    this.halfW = Math.max(size.x, size.z) / 2;
  }

  /* The distance that fits it, for the shape of frame it is being drawn in.
     A card is a tall sliver and a hero is nearly square, and a distance that
     fits the height of one cuts the sleeves off the other — so this is
     recomputed from the live aspect rather than fixed when the mesh is made. */
  fit(aspect) {
    const half = Math.tan((this.camera.fov * DEG) / 2);
    const forHeight = this.halfH / half;
    const forWidth = this.halfW / (half * aspect);
    this.camera.position.set(0, 0, Math.max(forHeight, forWidth) * 1.1);
    this.camera.lookAt(0, 0, 0);
  }

  attach() {
    const stage = this.stage;
    stage.appendChild(this.canvas);
    stage.dataset.mode = "webgl";

    /* garment.js owns the pointer, the drag and the arrow keys; it calls this
       on every change. One input implementation, two renderers. */
    stage.__garmentTurn = (rx, ry) => {
      this.target.x = rx * DEG;
      this.target.y = ry * DEG;
      this.settling = true;
      this.markDirty();
    };

    /* Whatever angle the drawing was already showing carries over to the mesh:
       the lookbook rail leans its pieces by writing these, and the garment
       should not snap square the moment it is upgraded. Taken up rather than
       eased into, because there is nothing on screen yet to ease from. */
    const angle = (name) => {
      const raw = stage.style.getPropertyValue(name).trim();
      const n = parseFloat(raw);
      return isFinite(n) ? n * DEG : 0;
    };
    this.target.x = this.current.x = angle("--g3d-rx");
    this.target.y = this.current.y = angle("--g3d-ry");

    if (typeof ResizeObserver === "function") {
      this.ro = new ResizeObserver(() => this.markDirty());
      this.ro.observe(stage);
    }
  }

  markDirty() {
    if (this.dead) return;
    this.dirty = true;
    schedule();
  }

  draw(r) {
    this.dirty = false;
    const stage = this.stage;
    if (!stage.isConnected) { this.dispose(); return; }

    const w = Math.max(Math.round(stage.clientWidth), 1);
    const h = Math.max(Math.round(stage.clientHeight), 1);
    if (!w || !h) return;

    /* Ease towards the angle the input asked for; stop when close enough. */
    const ease = 0.22;
    this.current.x += (this.target.x - this.current.x) * ease;
    this.current.y += (this.target.y - this.current.y) * ease;
    const near = Math.abs(this.target.x - this.current.x) < 0.0015 &&
                 Math.abs(this.target.y - this.current.y) < 0.0015;
    if (near) {
      this.current.x = this.target.x;
      this.current.y = this.target.y;
      this.settling = false;
    } else {
      this.settling = true;
      this.dirty = true;
    }
    this.pivot.rotation.set(this.current.x, this.current.y, 0);

    const ratio = r.getPixelRatio();
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.canvas.width = Math.round(w * ratio);
      this.canvas.height = Math.round(h * ratio);
    }

    this.camera.aspect = w / h;
    this.fit(this.camera.aspect);
    this.camera.updateProjectionMatrix();
    r.setSize(w, h, false);
    r.render(this.scene, this.camera);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(r.domElement, 0, 0, this.canvas.width, this.canvas.height);

    if (!this.shown) {
      this.shown = true;
      /* Only now is the SVG garment stood down: there has never been a moment
         with nothing on screen. */
      this.stage.dataset.mode = "webgl";
      this.canvas.classList.add("is-ready");
    }
  }

  /* Something broke after we took over — hand the stage back to the SVG. */
  giveUp() {
    if (this.dead) return;
    this.stage.removeAttribute("data-mode");
    this.dispose();
  }

  dispose() {
    this.dead = true;
    views.delete(this);
    if (this.ro) this.ro.disconnect();
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    delete this.stage.__garmentTurn;
    if (this.garment) {
      this.garment.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      (this.garment.userData.materials || []).forEach((m) => m.dispose());
    }
  }
}

/* ---------------------------------------------------------------------------
   the upgrade pass
   ------------------------------------------------------------------------ */

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) { return false; }
}

const seen = new WeakSet();

/* Off-screen garments are not built until they are close to being looked at:
   the shop page has twelve, and building them all on load would cost a visible
   pause for meshes nobody has scrolled to. */
let watcher = null;
function watch(stage) {
  if (!watcher) {
    if (typeof IntersectionObserver !== "function") { upgrade(stage); return; }
    watcher = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        watcher.unobserve(e.target);
        upgrade(e.target);
      });
    }, { rootMargin: "300px" });
  }
  watcher.observe(stage);
}

function upgrade(stage) {
  if (!stage.isConnected || stage.dataset.mode === "webgl") return null;
  const id = stage.dataset.productId;
  const product = id && T.byId ? T.byId(id) : null;
  if (!product) return null;

  const view = new GarmentView(stage, product);
  views.add(view);
  view.ready = view.build();
  view.ready.catch((err) => {
    /* No WebGL, no texture, no context — the SVG garment is already there and
       stays there. Nothing to report to the shopper: they are looking at a
       picture of the piece either way, so this is a line for whoever is
       working on the site rather than a message on the page. */
    if (window.console && console.debug) {
      console.debug("[threadline] no mesh for " + id + ", keeping the drawn garment:", err);
    }
    view.dispose();
  });
  return view;
}

function sweep(root) {
  const stages = (root || document).querySelectorAll(".g3d[data-product-id]");
  stages.forEach((stage) => {
    if (seen.has(stage)) return;
    seen.add(stage);
    watch(stage);
  });
}

function start() {
  if (!webglAvailable()) return;

  sweep(document);

  /* The grids re-render on every category click, and product.html builds its
     hero after this module has run, so new stages keep arriving. */
  const mo = new MutationObserver((records) => {
    let touched = false;
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType === 1) { touched = true; break; }
      }
      if (touched) break;
    }
    if (touched) sweep(document);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  /* Views whose stage has been thrown away (a filter click rebuilds the grid)
     let go of their meshes rather than waiting for the tab to close. */
  setInterval(() => {
    views.forEach((v) => { if (!v.stage.isConnected) v.dispose(); });
  }, 5000);
}

/* Build and draw one stage right now, skipping both the wait to be scrolled
   into view and the wait for the next animation frame.

   A tab that is not the visible one gets neither IntersectionObserver
   callbacks nor animation frames, which is exactly the behaviour you want
   from a shop opened in a background tab — nothing is built for a page
   nobody is looking at, and it all arrives the moment they switch to it.
   It also means a test page, which usually is not the visible tab, would
   sit there asserting against a garment that never got built. This is the
   door for it. Resolves with the view, or rejects if the mesh could not be
   made — in which case the drawn garment is still on screen. */
T.garment3dNow = function (stage) {
  if (!stage) return Promise.reject(new Error("no-stage"));
  if (!webglAvailable()) return Promise.reject(new Error("no-webgl"));
  seen.add(stage);
  if (watcher) watcher.unobserve(stage);

  /* Already a mesh — because it scrolled into view first, or because this was
     called twice. Hand back the view it already has rather than refusing. */
  let existing = null;
  views.forEach((v) => { if (v.stage === stage) existing = v; });
  if (existing) return existing.ready.then(() => existing);

  const view = upgrade(stage);
  if (!view) return Promise.reject(new Error("not-a-garment"));
  return view.ready.then(() => {
    const r = getRenderer();
    if (!r) throw new Error("no-renderer");
    view.draw(r);
    return view;
  });
};

/* Draw every garment that is waiting for a frame, now, instead of at the next
   animation frame. The same reason as garment3dNow: a tab that is not the
   visible one is given no animation frames, so a test — or anything else that
   needs the picture to be current at a known moment — would be looking at the
   frame before the one it just asked for. */
T.garment3dDraw = function () {
  const r = getRenderer();
  if (!r) return 0;
  let drawn = 0;
  views.forEach((v) => { if (v.dirty) { v.draw(r); drawn++; } });
  return drawn;
};

/* A tab brought forward may have been given stages while it was hidden. */
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) { sweep(document); views.forEach((v) => v.markDirty()); }
});

/* Announced so a page, or a test, can tell whether the mesh renderer is the
   one on screen. */
T.garment3dReady = true;
/* The mesh recipes, keyed the same way scripts/garment.js keys its drawings.
   Exposed so a test can hold the two maps against each other: a garment added
   to the catalogue with a shape but no rings here would quietly fall back to
   a tee-shaped mesh, which is the kind of wrong that nobody notices. */
T.GARMENT_MESH_SHAPES = SHAPES;
T.garment3dViews = views;
T.garment3dUpgrade = sweep;

start();
