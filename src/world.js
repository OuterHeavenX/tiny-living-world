// Tiny Living World — Willowbrook diorama (procedural low-poly town).
// Static scenery is baked into a few merged, vertex-coloured meshes so the whole
// town costs only a handful of draw calls on iPhone Safari. Small animated pieces
// (fountain, smoke, butterflies, ducks, clouds, flag, clock) are separate.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const PI = Math.PI;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const noise = (x, z) => Math.sin(x * 1.3 + Math.sin(z * .7)) * .5 + Math.sin(z * 1.1 + Math.sin(x * .9) * 1.3) * .5;

// Palette
const P = {
  grassA: 0x8cc56b, grassB: 0x72ae58, grassC: 0xa7d176,
  dirt: 0x8b6447, rock: 0x9a958c, rockDark: 0x7d786f,
  road: 0xd6c09b, side: 0xe9e1cf, curb: 0xcfc6b2, path: 0xe6d3ab, stone: 0xa39b90,
  white: 0xf7f3ea, wood: 0x9a6a4a, woodD: 0x6e4a35, woodL: 0xc49a6c, iron: 0x2f4a3f, metal: 0x3d4a46,
  glass: 0x93c6d8, lamp: 0xfff1c9, water: 0x6cc3e0,
  leaf: [0x5a9e5f, 0x4f9358, 0x68ad63, 0x3f8456], autumn: [0xe39a3b, 0xd8763a, 0xf0c05a, 0xc9573f], pine: [0x3d7a55, 0x467f5a, 0x356f4c],
  flowers: [0xff7aa2, 0xffd166, 0xf25f5c, 0xb388eb, 0xffffff, 0xff9f43, 0x6fa8ff],
  warm: [0xf25f5c, 0xffd166, 0xff9f43], pinks: [0xff7aa2, 0xffb3c8, 0xffffff], purples: [0xb388eb, 0x8f6ad6, 0xd6b8ff],
};

export function buildWorld(scene, sites, opts = {}) {
  const t0 = performance.now();
  let rnd = mulberry32(opts.seed ?? 20261023); // swapped for a per-plot generator when a plot is rebuilt
  const R = (a, b) => a + (b - a) * rnd();
  const pick = a => a[Math.floor(rnd() * a.length)];
  const dark = (c, k = .72) => new THREE.Color(c).multiplyScalar(k).getHex();
  const shade = (c, l) => new THREE.Color(c).offsetHSL(0, 0, l).getHex();

  /* ---------- shared unit geometries ---------- */
  const Geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl6: new THREE.CylinderGeometry(1, 1, 1, 6), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
    cyl10: new THREE.CylinderGeometry(1, 1, 1, 10), cyl12: new THREE.CylinderGeometry(1, 1, 1, 12), cyl16: new THREE.CylinderGeometry(1, 1, 1, 16),
    cone4: new THREE.ConeGeometry(1, 1, 4).rotateY(PI / 4), cone6: new THREE.ConeGeometry(1, 1, 6), cone8: new THREE.ConeGeometry(1, 1, 8),
    ico0: new THREE.IcosahedronGeometry(1, 0), ico1: new THREE.IcosahedronGeometry(1, 1), dode: new THREE.DodecahedronGeometry(1, 0), octa: new THREE.OctahedronGeometry(1, 0),
    halfDisc: new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, -PI / 2, PI).rotateX(-PI / 2), // upper half disc in x-y, depth along z
    disc: new THREE.CylinderGeometry(1, 1, 1, 16).rotateX(PI / 2),                             // disc facing z
    torus: new THREE.TorusGeometry(1, .28, 5, 10),
  };
  const exCache = new Map();
  function ex(pts) { // extruded profile in x-y, unit depth along z (centred)
    const k = pts.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(';');
    let g = exCache.get(k);
    if (!g) { g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))), { depth: 1, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -.5); exCache.set(k, g); }
    return g;
  }
  const prepCache = new Map();
  function prep(g) { let n = prepCache.get(g); if (!n) { n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals(); n.computeBoundingBox(); prepCache.set(g, n); } return n; }

  /* ---------- batching ---------- */
  let track = null; const _bb = new THREE.Box3();
  class Batch {
    constructor() { this.parts = []; }
    add(geo, color, m, j = .035, sway = 0, baseY = 0) {
      const g = prep(geo), c = new THREE.Color(color);
      if (j) c.offsetHSL((rnd() - .5) * j * .2, (rnd() - .5) * j, (rnd() - .5) * j);
      this.parts.push({ g, c, m: m.clone(), sway, baseY });
      if (track) { _bb.copy(g.boundingBox).applyMatrix4(m); track.union(_bb); }
    }
    geometry(withSway = false) {
      let n = 0; for (const p of this.parts) n += p.g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), sw = withSway ? new Float32Array(n) : null;
      const v = new THREE.Vector3(), nm = new THREE.Matrix3(); let o = 0;
      for (const { g, c, m, sway, baseY } of this.parts) {
        const PA = g.attributes.position, NA = g.attributes.normal; nm.getNormalMatrix(m);
        for (let i = 0; i < PA.count; i++, o++) {
          v.fromBufferAttribute(PA, i).applyMatrix4(m); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
          if (sw) sw[o] = sway * Math.max(0, v.y - baseY);
          v.fromBufferAttribute(NA, i).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
          col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (sw) geo.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
      geo.computeBoundingSphere(); return geo;
    }
  }
  let W = new Batch(), F = new Batch(), GL = new Batch(); // current target batches (plots build into their own)
  let dyn = false, addTarget = null; // building a plot's dynamic content: no keep-out areas, add meshes to its group

  /* ---------- transforms ---------- */
  const base = new THREE.Matrix4(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function at(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); return _m.premultiply(base); }
  function withT(x, y, z, ry, fn) { const saved = base.clone(); _e.set(0, ry, 0); _q.setFromEuler(_e); base.multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(1, 1, 1))); fn(); base.copy(saved); }
  const wx = x => base.elements[12] + x, wy = y => base.elements[13] + y, wz = z => base.elements[14] + z; // sites are never rotated

  const box = (b, c, x, y, z, w, h, d, ry = 0, j, rx = 0, rz = 0) => b.add(Geo.box, c, at(x, y, z, ry, w, h, d, rx, rz), j);
  const boxB = (b, c, x, y, z, w, h, d, ry = 0, j) => box(b, c, x, y + h / 2, z, w, h, d, ry, j);
  const cyl = (b, c, x, y, z, r, h, seg = 8, j, sz) => b.add(Geo['cyl' + seg], c, at(x, y + h / 2, z, 0, r, h, sz ?? r), j);
  const cone = (b, c, x, y, z, r, h, seg = 6, j, ry = 0) => b.add(seg === 4 ? Geo.cone4 : Geo['cone' + seg], c, at(x, y + h / 2, z, ry, r, h, r), j);
  const fol = (geo, c, x, y, z, sx, sy, sz, sway = .25, baseY = 0, ry = 0, j = .05) => F.add(geo, c, at(x, y, z, ry, sx, sy, sz), j, sway, wy(baseY));

  /* ---------- keep-out areas for scattered decoration ---------- */
  const keep = [];
  const keepL = (x0, z0, x1, z1) => dyn || keep.push([wx(Math.min(x0, x1)), wz(Math.min(z0, z1)), wx(Math.max(x0, x1)), wz(Math.max(z0, z1))]);
  const free = (x, z, r = .3) => !keep.some(k => x > k[0] - r && x < k[2] + r && z > k[1] - r && z < k[3] + r);

  const lampSpots = [], flowerSpots = [], swing = {};

  /* ================= GROUND / DIORAMA BASE ================= */
  const S = 64, HALF = 32;
  {
    const g = new THREE.PlaneGeometry(S, S, 48, 48).rotateX(-PI / 2).toNonIndexed();
    const PA = g.attributes.position, col = new Float32Array(PA.count * 3);
    for (let i = 0; i < PA.count; i++) { // gentle mounds around the rim, flat town
      const x = PA.getX(i), z = PA.getZ(i), e = Math.max(Math.abs(x), Math.abs(z));
      PA.setY(i, e > 28.6 && e < 31.9 ? Math.max(0, noise(x * .45, z * .45) + .35) * .75 * Math.sin((e - 28.6) / 3.3 * PI) : 0);
    }
    const a = new THREE.Color(P.grassA), b = new THREE.Color(P.grassB), c = new THREE.Color(P.grassC), t = new THREE.Color();
    for (let f = 0; f < PA.count; f += 3) {
      const cx = (PA.getX(f) + PA.getX(f + 1) + PA.getX(f + 2)) / 3, cz = (PA.getZ(f) + PA.getZ(f + 1) + PA.getZ(f + 2)) / 3;
      t.copy(a).lerp(b, noise(cx * .13, cz * .13) * .5 + .5); if (noise(cx * .37 + 9, cz * .37) > .55) t.lerp(c, .55);
      t.offsetHSL(0, 0, (rnd() - .5) * .03);
      for (let k = 0; k < 3; k++) col.set([t.r, t.g, t.b], (f + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    ground.receiveShadow = true; ground.name = 'ground'; scene.add(ground);
    // layered diorama slab
    boxB(W, shade(P.grassB, -.04), 0, -.5, 0, S + .5, .48, S + .5, 0, 0);
    boxB(W, P.dirt, 0, -2.2, 0, S + .1, 1.72, S + .1, 0, 0);
    boxB(W, 0x6f5442, 0, -2.75, 0, S - .1, .55, S - .1, 0, 0);
    boxB(W, 0x7b7268, 0, -3.7, 0, S - .5, .95, S - .5, 0, 0);
    for (let i = 0; i < 70; i++) { // pebbles in the soil walls
      const side = i % 4, u = R(-HALF + 1, HALF - 1), y = R(-3.3, -.9), s = R(.35, .8);
      const [x, z] = side === 0 ? [u, HALF + .02] : side === 1 ? [u, -HALF - .02] : side === 2 ? [HALF + .02, u] : [-HALF - .02, u];
      W.add(Geo.dode, pick([P.rock, P.rockDark, 0xa58d72]), at(x, y, z, R(0, 6), s, s * .7, s, R(0, 2), R(0, 2)), .05);
    }
  }

  /* ================= ROADS, SIDEWALKS, CROSSINGS ================= */
  const hRoads = [-10, 8], vRoads = [-13, 0, 13], RH = 1.6, RV = 1.5;
  for (const z of hRoads) { keepL(-HALF, z - RH - 1.1, HALF, z + RH + 1.1); for (let x = -31; x < 31; x += 2) boxB(W, P.road, x + 1, 0, z, 2.02, .05, RH * 2, 0, .07); }
  for (const x of vRoads) {
    keepL(x - RV - 1.1, -29, x + RV + 1.1, 29);
    for (const [a, b] of [[-29, -10 - RH], [-10 + RH, 8 - RH], [8 + RH, 29]]) { const n = Math.ceil((b - a) / 2), L = (b - a) / n; for (let i = 0; i < n; i++) boxB(W, P.road, x, 0, a + L * (i + .5), RV * 2, .05, L + .02, 0, .07); }
  }
  // crosswalk stripes
  for (const xr of vRoads) for (const zr of hRoads) {
    for (const s of [-1, 1]) {
      for (let k = -2; k <= 2; k++) box(W, P.white, xr + k * .55, .056, zr + s * (RH + .85), .3, .012, 1.1, 0, 0); // across vertical road
      for (let k = -2; k <= 2; k++) box(W, P.white, xr + s * (RV + .85), .056, zr + k * .58, 1.1, .012, .3, 0, 0);
    }
  }
  // sidewalks: a ring inside every block along its road sides
  const xs = [[-HALF, -13 - RV], [-13 + RV, -RV], [RV, 13 - RV], [13 + RV, HALF]], zs = [[-HALF, -10 - RH], [-10 + RH, 8 - RH], [8 + RH, HALF]];
  const SW = 1.1;
  function walkStrip(x0, z0, x1, z1) {
    const along = (x1 - x0) > (z1 - z0), L = along ? x1 - x0 : z1 - z0, n = Math.max(1, Math.round(L / 1.6));
    for (let i = 0; i < n; i++) {
      const u = (i + .5) / n;
      if (along) boxB(W, P.side, x0 + (x1 - x0) * u, 0, (z0 + z1) / 2, L / n - .03, .14, z1 - z0, 0, .03);
      else boxB(W, P.side, (x0 + x1) / 2, 0, z0 + (z1 - z0) * u, x1 - x0, .14, L / n - .03, 0, .03);
    }
  }
  for (const [x0, x1] of xs) for (const [z0, z1] of zs) {
    const N = z0 !== -HALF, Sd = z1 !== HALF, Wd = x0 !== -HALF, E = x1 !== HALF;
    const hx0 = Math.max(x0, -31), hx1 = Math.min(x1, 31);
    if (N) walkStrip(hx0, z0, hx1, z0 + SW);
    if (Sd) walkStrip(hx0, z1 - SW, hx1, z1);
    const vz0 = Math.max(z0, -29) + (N ? SW : 0), vz1 = Math.min(z1, 29) - (Sd ? SW : 0);
    if (Wd) walkStrip(x0, vz0, x0 + SW, vz1);
    if (E) walkStrip(x1 - SW, vz0, x1, vz1);
  }

  /* ================= SMALL PROPS ================= */
  function lamp(x, z) {
    cyl(W, P.iron, x, 0, z, .17, .28, 8, 0); cyl(W, P.iron, x, .28, z, .07, 2.75, 6, 0);
    box(W, P.iron, x, 3.08, z, .46, .08, .46, 0, 0);
    GL.add(Geo.box, P.lamp, at(x, 3.35, z, 0, .32, .46, .32), 0);
    for (const [dx, dz] of [[-.17, -.17], [.17, -.17], [-.17, .17], [.17, .17]]) box(W, P.iron, x + dx, 3.35, z + dz, .05, .5, .05, 0, 0);
    cone(W, P.iron, x, 3.6, z, .38, .34, 4, 0); cyl(W, P.iron, x, 3.92, z, .05, .16, 6, 0);
    if (!dyn) lampSpots.push([wx(x), wz(z), 2.8]);
  }
  function picket(x0, z0, x1, z1, c = P.white, h = .78) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    for (const y of [h * .32, h * .72]) box(W, c, mx, y, mz, L, .07, .05, ry, .02);
    const n = Math.max(1, Math.round(L / .3));
    for (let i = 0; i <= n; i++) { const u = i / n, px = x0 + dx * u, pz = z0 + dz * u; box(W, c, px, h / 2, pz, .11, h, .045, ry, .03); W.add(Geo.cone4, c, at(px, h + .06, pz, ry, .08, .13, .03), .02); }
    for (const u of [0, 1]) boxB(W, c, x0 + dx * u, 0, z0 + dz * u, .15, h + .1, .15, ry, .02);
    keepL(Math.min(x0, x1) - .2, Math.min(z0, z1) - .2, Math.max(x0, x1) + .2, Math.max(z0, z1) + .2);
  }
  function railFence(x0, z0, x1, z1, c = P.woodL) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), n = Math.max(1, Math.round(L / 1.6));
    for (let i = 0; i <= n; i++) cyl(W, c, x0 + dx * i / n, 0, z0 + dz * i / n, .08, .9, 6, .05);
    for (let i = 0; i < n; i++) for (const y of [.38, .74]) { const u = (i + .5) / n; box(W, c, x0 + dx * u, y, z0 + dz * u, L / n + .05, .08, .06, ry, .06, 0, R(-.03, .03)); }
    keepL(Math.min(x0, x1) - .2, Math.min(z0, z1) - .2, Math.max(x0, x1) + .2, Math.max(z0, z1) + .2);
  }
  function hedge(x0, z0, x1, z1, h = .7, c = 0x4c8c4f) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
    boxB(W, c, (x0 + x1) / 2, 0, (z0 + z1) / 2, L, h, .6, ry, .04);
    const n = Math.max(1, Math.round(L / .7));
    for (let i = 0; i < n; i++) { const u = (i + .5) / n; fol(Geo.ico0, shade(c, R(-.03, .05)), x0 + dx * u, h + .02, z0 + dz * u, .42, .26, .36, .08, 0, R(0, 6)); }
    keepL(Math.min(x0, x1) - .35, Math.min(z0, z1) - .35, Math.max(x0, x1) + .35, Math.max(z0, z1) + .35);
  }
  function roundTree(x, z, s = 1, pal = P.leaf, fruit) {
    const h = 1.35 * s; cyl(W, 0x87593d, x, 0, z, .17 * s, h + .7 * s, 6, .06);
    const c = pick(pal), y = h + 1.05 * s;
    fol(Geo.ico1, c, x, y, z, 1.25 * s, 1.08 * s, 1.25 * s, .2, 0, R(0, 6));
    fol(Geo.ico1, shade(c, .04), x + .75 * s, y - .3 * s, z + .35 * s, .82 * s, .76 * s, .82 * s, .2, 0, R(0, 6));
    fol(Geo.ico1, shade(c, -.03), x - .62 * s, y - .18 * s, z - .42 * s, .88 * s, .8 * s, .88 * s, .2, 0, R(0, 6));
    if (fruit) for (let i = 0; i < 9; i++) { const a = R(0, PI * 2), r = R(.8, 1.15) * s; fol(Geo.ico0, fruit, x + Math.cos(a) * r, y + R(-.5, .45) * s, z + Math.sin(a) * r, .1, .1, .1, .2, 0); }
    keepL(x - .9 * s, z - .9 * s, x + .9 * s, z + .9 * s);
  }
  function pineTree(x, z, s = 1) {
    cyl(W, 0x7a4f37, x, 0, z, .16 * s, .9 * s, 6, .05); const c = pick(P.pine);
    [[1.25, 1.5, .6], [1.0, 1.35, 1.45], [.72, 1.2, 2.25], [.42, .9, 2.95]].forEach(([r, h, y], i) => fol(Geo.cone6, shade(c, i * .02), x, (y + h / 2) * s, z, r * s, h * s, r * s, .12, 0, R(0, 6)));
    keepL(x - .9 * s, z - .9 * s, x + .9 * s, z + .9 * s);
  }
  function poplar(x, z, s = 1) {
    cyl(W, 0x87593d, x, 0, z, .14 * s, 1.2 * s, 6, .05);
    fol(Geo.ico1, pick([0x6fa95a, 0x7fb35a, 0xd9b34a]), x, 2.9 * s, z, .75 * s, 2.0 * s, .75 * s, .14, 0, R(0, 6));
    keepL(x - .6, z - .6, x + .6, z + .6);
  }
  const shrub = (x, z, r = .5, c = pick(P.leaf)) => { fol(Geo.dode, c, x, r * .65, z, r, r * .78, r, .12, 0, R(0, 6)); keepL(x - r, z - r, x + r, z + r); };
  function flowers(x, z, n, sx, sz, pal = P.flowers) {
    for (let i = 0; i < n; i++) {
      const px = x + R(-sx, sx), pz = z + R(-sz, sz), y = R(.22, .38);
      fol(Geo.ico0, pick([0x5fa04f, 0x6fb35a, 0x4f8f47]), px, .1, pz, .13, .16, .13, .35, 0, R(0, 6));
      fol(Geo.octa, pick(pal), px + R(-.05, .05), y, pz + R(-.05, .05), .095, .085, .095, .45, 0, R(0, 6), .03);
    }
    flowerSpots.push([wx(x), wz(z)]);
  }
  const rock = (x, z, s = .5, c = pick([P.rock, P.rockDark, 0xb0a99c])) => W.add(Geo.dode, c, at(x, s * .25, z, R(0, 6), s * R(.9, 1.3), s * R(.55, .8), s * R(.8, 1.2), R(-.3, .3), R(-.3, .3)), .05);
  function tuft(x, z, s = 1) { const c = pick([0x6fae55, 0x7cbb5d, 0x5f9f4b]); for (let k = 0; k < 3; k++) fol(Geo.cone4, c, x + R(-.08, .08), .17 * s, z + R(-.08, .08), .05 * s, .36 * s, .05 * s, .9, 0, R(0, 6)); }
  function bench(x, z, ry, y = 0) {
    withT(x, y, z, ry, () => {
      for (const sx of [-.72, .72]) { boxB(W, P.metal, sx, 0, 0, .08, .45, .46, 0, 0); box(W, P.metal, sx, .72, -.23, .08, .55, .07, 0, 0); }
      for (let i = 0; i < 3; i++) box(W, 0xb07a52, 0, .47, -.14 + i * .15, 1.75, .06, .13, 0, .05);
      for (let i = 0; i < 2; i++) box(W, 0xb07a52, 0, .68 + i * .2, -.25, 1.75, .13, .05, 0, .05);
    });
    keepL(x - 1, z - 1, x + 1, z + 1);
  }
  function tableSet(x, z, chairs = 2, umbrella) {
    cyl(W, P.metal, x, 0, z, .3, .04, 8, 0); cyl(W, P.metal, x, 0, z, .05, .72, 6, 0); cyl(W, P.white, x, .72, z, .5, .05, 12, .02);
    for (let i = 0; i < chairs; i++) {
      const a = i / chairs * PI * 2 + .4, cx = x + Math.cos(a) * .85, cz = z + Math.sin(a) * .85, ry = -a - PI / 2;
      boxB(W, P.metal, cx, 0, cz, .08, .44, .08, ry, 0); box(W, 0x8f5a3c, cx, .46, cz, .42, .06, .42, ry, .05);
      box(W, 0x8f5a3c, cx - Math.cos(a) * .2, .72, cz - Math.sin(a) * .2, .42, .44, .06, ry + PI / 2, .05);
    }
    if (umbrella) { cyl(W, P.white, x, .75, z, .035, 1.6, 6, 0); cone(W, umbrella, x, 2.12, z, 1.35, .55, 8, .02); cone(W, P.white, x, 2.12, z, 1.37, .08, 8, 0); cyl(W, P.white, x, 2.64, z, .05, .14, 6, 0); }
    keepL(x - 1.1, z - 1.1, x + 1.1, z + 1.1);
  }
  function barrel(x, z, c = 0x9b6a45) { cyl(W, c, x, 0, z, .32, .8, 10, .05); for (const y of [.15, .62]) cyl(W, P.metal, x, y, z, .335, .05, 10, 0); }
  function crate(x, z, s = .5, ry = R(-.4, .4)) { boxB(W, 0xc39a68, x, 0, z, s, s, s, ry, .08); box(W, 0xa57c50, x, s / 2, z, s + .02, .06, s + .02, ry, .03); }
  function planter(x, z, w = .9, d = .5, pal = P.flowers) { boxB(W, 0x8a5a3b, x, 0, z, w, .45, d, 0, .05); boxB(W, 0x5b3f2c, x, .45, z, w - .1, .02, d - .1, 0, 0); for (let i = 0; i < Math.round(w * 6); i++) { const px = x + R(-w / 2 + .1, w / 2 - .1), pz = z + R(-d / 2 + .1, d / 2 - .1); fol(Geo.ico0, 0x5fa04f, px, .55, pz, .13, .12, .13, .3, .45); fol(Geo.octa, pick(pal), px, .66, pz, .09, .08, .09, .4, .45); } flowerSpots.push([wx(x), wz(z)]); }
  function pot(x, z, r = .25, pal) { cyl(W, 0xc06a45, x, 0, z, r, r * 1.6, 8, .06); cyl(W, 0xb05f3e, x, r * 1.6, z, r * 1.12, .07, 8, 0); if (pal) { for (let i = 0; i < 4; i++) fol(Geo.octa, pick(pal), x + R(-r, r) * .6, r * 1.6 + .2, z + R(-r, r) * .6, .1, .09, .1, .4, r * 1.6); fol(Geo.ico0, 0x5fa04f, x, r * 1.6 + .1, z, r * .9, .2, r * .9, .3, r * 1.6); } else fol(Geo.ico1, 0x4f9358, x, r * 1.6 + r * .9, z, r * 1.05, r * 1.05, r * 1.05, .15, r * 1.6); }
  function stones(x, z0, z1) { for (let z = z0; z < z1; z += .72) cyl(W, pick([0xd4cab6, 0xc9bfa9, 0xddd3bf]), x + R(-.12, .12), 0, z, R(.28, .36), .06, 8, .03, R(.22, .3)); keepL(x - .5, z0, x + .5, z1); }
  function path(x0, z0, x1, z1, c = P.path) { boxB(W, c, (x0 + x1) / 2, 0, (z0 + z1) / 2, Math.abs(x1 - x0), .035, Math.abs(z1 - z0), 0, .02); keepL(x0, z0, x1, z1); }
  function mailbox(x, z, c = 0x3f6fae) { cyl(W, P.woodD, x, 0, z, .05, 1.0, 6, 0); boxB(W, c, x, 1.0, z, .3, .28, .5, 0, .03); W.add(Geo.halfDisc, c, at(x, 1.28, z, PI / 2, .15, .15, .5), .03); box(W, 0xd9493c, x + .17, 1.32, z - .1, .03, .22, .05, 0, 0); }

  /* ================= ARCHITECTURE KIT ================= */
  function shell(w, d, h, col, o = {}) {
    boxB(W, col, 0, 0, 0, w, h, d, 0, .02);
    boxB(W, o.stone ?? P.stone, 0, 0, 0, w + .2, .42, d + .2, 0, .03);
    const tc = o.trim ?? P.white;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(W, o.beams ?? tc, sx * w / 2, h / 2 + .2, sz * d / 2, .2, h - .4, .2, 0, .02);
    if (o.band !== false) box(W, tc, 0, h - .08, 0, w + .14, .16, d + .14, 0, .02);
    keepL(-w / 2 - .3, -d / 2 - .3, w / 2 + .3, d / 2 + .3);
  }
  function roofProfile(kind, hw, rh, oh) {
    const a = hw + oh;
    if (kind === 'gambrel') return [[-a, -.15], [a, -.15], [hw * .62, rh * .7], [0, rh], [-hw * .62, rh * .7]];
    if (kind === 'mansard') return [[-a, -.15], [a, -.15], [hw * .74, rh * .86], [hw * .52, rh], [-hw * .52, rh], [-hw * .74, rh * .86]];
    return [[-a, -.15], [a, -.15], [0, rh]];
  }
  function roof({ kind = 'gable', w, d, h0, rh, oh = .45, ohe = .25, roof: rc, wall, along = 'x', x = 0, z = 0 }) {
    const hw = (along === 'x' ? d : w) / 2, L = (along === 'x' ? w : d) + 2 * ohe, ry = along === 'x' ? PI / 2 : 0;
    const outer = roofProfile(kind, hw, rh, oh), k = (hw - .04) / (hw + oh), kv = (rh - .36) / rh;
    const inner = outer.map(([u, v]) => [u * k, v < 0 ? 0 : v * kv]);
    W.add(ex(outer), rc, at(x, h0, z, ry, 1, 1, L), .04);
    W.add(ex(inner), wall, at(x, h0, z, ry, 1, 1, L + .07), .02);
    if (kind === 'gable') box(W, dark(rc, .8), x, h0 + rh - .02, z, along === 'x' ? L + .06 : .24, .16, along === 'x' ? .24 : L + .06, 0, .02);
    // shingle courses: thin darker lines along the slopes
    if (kind === 'gable') { const ang = Math.atan2(rh + .15, hw + oh); for (let i = 1; i < 4; i++) { const u = i / 4, yy = h0 - .15 + (rh + .15) * u + .03, zz = (hw + oh) * (1 - u); for (const s of [-1, 1]) { if (along === 'x') box(W, dark(rc, .86), x, yy, z + s * zz, L, .05, .2, 0, .02, s * ang); else box(W, dark(rc, .86), x + s * zz, yy, z, .2, .05, L, 0, .02, 0, -s * ang); } } }
  }
  const hip = (w, d, h0, rh, oh, c, x = 0, z = 0) => { W.add(Geo.cone4, c, at(x, h0 + rh / 2 - .14, z, 0, (w / 2 + oh) / .7071, rh, (d / 2 + oh) / .7071), .03); box(W, dark(c, .8), x, h0 - .1, z, w + 2 * oh, .12, d + 2 * oh, 0, .02); };
  function chimney(x, z, y0, top, c = 0xa85a45) { boxB(W, c, x, y0, z, .72, top - y0, .72, 0, .04); box(W, dark(c, .8), x, top + .07, z, .9, .14, .9, 0, 0); cyl(W, 0xb5654a, x, top + .14, z, .14, .32, 6, 0); return [wx(x), top + .5, wz(z)]; }
  function win(x, y, z, w, h, o = {}) {
    withT(x, y, z + .01, o.ry || 0, () => {
      const fc = o.frame ?? P.white;
      GL.add(Geo.box, o.glass ?? P.glass, at(0, 0, 0, 0, w, h, .07), .03);
      if (o.arch) { GL.add(Geo.halfDisc, o.glass ?? P.glass, at(0, h / 2, 0, 0, w / 2, w / 2, .07), .03); W.add(Geo.halfDisc, fc, at(0, h / 2, -.02, 0, w / 2 + .12, w / 2 + .12, .09), .02); }
      else box(W, fc, 0, h / 2 + .06, .03, w + .24, .12, .12, 0, .02);
      box(W, fc, 0, -h / 2 - .06, .03, w + .24, .12, .12, 0, .02);
      for (const s of [-1, 1]) box(W, fc, s * (w / 2 + .06), 0, .03, .12, h + .24, .12, 0, .02);
      if (o.mull !== false) { box(W, fc, 0, 0, .06, .05, h, .04, 0, 0); box(W, fc, 0, o.arch ? h * .1 : 0, .06, w, .05, .04, 0, 0); }
      box(W, fc, 0, -h / 2 - .14, .12, w + .42, .08, .26, 0, .02);
      if (o.shutter) for (const s of [-1, 1]) { box(W, o.shutter, s * (w / 2 + .14 + w * .21), 0, .04, w * .42, h + .1, .06, 0, .03); for (let k = -2; k <= 2; k++) box(W, dark(o.shutter, .82), s * (w / 2 + .14 + w * .21), k * h / 6, .08, w * .34, .03, .02, 0, 0); }
      if (o.flowers) { box(W, o.boxColor ?? 0x8a5a3b, 0, -h / 2 - .36, .24, w + .2, .26, .3, 0, .04); for (let i = 0; i < Math.round(w * 7); i++) { const px = R(-w / 2, w / 2); fol(Geo.ico0, 0x5fa04f, px, -h / 2 - .2, .24 + R(-.06, .06), .12, .1, .1, .3, -h / 2 - .25); fol(Geo.octa, pick(o.flowers), px, -h / 2 - .1, .26 + R(-.06, .06), .085, .075, .085, .4, -h / 2 - .25); } }
    });
  }
  function door(x, z, w, h, c, o = {}) {
    withT(x, 0, z + .01, o.ry || 0, () => {
      const y0 = o.y0 ?? .42, fc = o.frame ?? P.white;
      box(W, c, 0, y0 + h / 2, .03, w, h, .08, 0, .02);
      if (o.arch) { W.add(Geo.halfDisc, c, at(0, y0 + h, .03, 0, w / 2, w / 2, .08), .02); W.add(Geo.halfDisc, fc, at(0, y0 + h, 0, 0, w / 2 + .14, w / 2 + .14, .1), .02); }
      else box(W, fc, 0, y0 + h + .09, .05, w + .32, .18, .12, 0, .02);
      for (const s of [-1, 1]) box(W, fc, s * (w / 2 + .07), y0 + h / 2, .05, .14, h, .12, 0, .02);
      if (o.glassTop) GL.add(Geo.box, P.glass, at(0, y0 + h * .72, .08, 0, w * .62, h * .3, .03), .02);
      else box(W, dark(c, .82), 0, y0 + h * .68, .08, w * .6, h * .26, .02, 0, 0);
      box(W, dark(c, .82), 0, y0 + h * .28, .08, w * .6, h * .3, .02, 0, 0);
      if (o.transom) GL.add(Geo.box, P.glass, at(0, y0 + h + .32, .04, 0, w, .3, .05), .02);
      box(W, 0xe0b84a, w * .32, y0 + h * .48, .11, .08, .08, .07, 0, 0);
      boxB(W, o.stepColor ?? 0xc9c1b1, 0, 0, .38, w + .7, y0, .75, 0, .03);
    });
  }
  function sign(i, x, y, z, w, ry = 0) {
    const h = w / SIGN_ASPECT, g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, (SIGNS.length - 1 - i + uv.getY(k)) / SIGNS.length);
    const m = new THREE.Mesh(g, signMat); placeOnBase(m, x, y, z + .07, ry); m.receiveShadow = true; (addTarget || scene).add(m);
    box(W, P.woodD, x, y, z + .02, w + .16, h + .16, .08, ry, 0);
    return m;
  }

  /* ---------- sign texture atlas ---------- */
  const SIGNS = [
    { text: 'Sunrise Bakery', bg: '#fff1d6', fg: '#8a3b22', accent: '#f2a93b', icon: 'sun' },
    { text: 'Petal & Stem', bg: '#5f8a68', fg: '#fffaf0', accent: '#ffb3c8', icon: 'flower' },
    { text: 'Corner Café', bg: '#4a3326', fg: '#ffe9c7', accent: '#e8b45a', icon: 'cup' },
    { text: 'Town Hall', bg: '#2f466b', fg: '#f6dc8a', accent: '#f6dc8a', icon: 'star' },
    { text: 'Willowbrook Park', bg: '#7a5236', fg: '#fff3dc', accent: '#9fd38a', icon: 'leaf' },
  ];
  const SIGN_ASPECT = 1024 / 200;
  const signTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 200 * SIGNS.length; const ctx = cv.getContext('2d');
    SIGNS.forEach((s, i) => {
      const y = i * 200; ctx.fillStyle = s.bg; ctx.fillRect(0, y, 1024, 200);
      ctx.strokeStyle = s.accent; ctx.lineWidth = 10; ctx.strokeRect(14, y + 14, 996, 172);
      ctx.fillStyle = s.fg; ctx.font = '700 104px Georgia, "Times New Roman", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = 104; while (ctx.measureText(s.text).width > 760 && size > 60) { size -= 4; ctx.font = `700 ${size}px Georgia, "Times New Roman", serif`; }
      ctx.fillText(s.text, 540, y + 104);
      ctx.fillStyle = s.accent; const ix = 92, iy = y + 100;
      ctx.beginPath();
      if (s.icon === 'sun') { ctx.arc(ix, iy, 30, 0, PI * 2); ctx.fill(); for (let k = 0; k < 8; k++) { const a = k * PI / 4; ctx.fillRect(ix + Math.cos(a) * 46 - 6, iy + Math.sin(a) * 46 - 6, 12, 12); } }
      else if (s.icon === 'flower') { for (let k = 0; k < 5; k++) { const a = k * PI * 2 / 5; ctx.moveTo(ix, iy); ctx.arc(ix + Math.cos(a) * 26, iy + Math.sin(a) * 26, 20, 0, PI * 2); } ctx.fill(); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(ix, iy, 14, 0, PI * 2); ctx.fill(); }
      else if (s.icon === 'cup') { ctx.fillRect(ix - 30, iy - 22, 50, 48); ctx.arc(ix + 26, iy, 14, -PI / 2, PI / 2); ctx.fill(); ctx.fillRect(ix - 40, iy + 30, 72, 8); }
      else if (s.icon === 'star') { for (let k = 0; k < 10; k++) { const r = k % 2 ? 18 : 42, a = -PI / 2 + k * PI / 5; ctx.lineTo(ix + Math.cos(a) * r, iy + Math.sin(a) * r); } ctx.fill(); }
      else { ctx.ellipse(ix, iy, 22, 40, .6, 0, PI * 2); ctx.fill(); }
    });
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: .75 });
  // place a separate mesh at a local position under the current transform (sites may be rotated when rebuilt)
  function placeOnBase(m, x, y, z, ry = 0) { _p.set(x, y, z).applyMatrix4(base); m.position.copy(_p); m.rotation.y = ry + Math.atan2(base.elements[8], base.elements[10]); }
  // signs for new businesses: one small canvas texture per name
  const dynSignCache = new Map();
  const SIGN_STYLE = {
    bakery: ['#fff1d6', '#8a3b22', '#f2a93b', 'sun'], cafe: ['#2f4a3a', '#ffe9c7', '#e8b45a', 'cup'], florist: ['#5f8a68', '#fffaf0', '#ffb3c8', 'flower'],
    repair: ['#30343b', '#ffd166', '#ff8c2a', 'gear'], bookstore: ['#3b2f5c', '#f6e7c8', '#d9b36b', 'book'], general: ['#f4efe2', '#2f5f8a', '#d9493c', 'basket'],
    restaurant: ['#5a1f24', '#ffe3b0', '#e8b45a', 'fork'], gallery: ['#ffffff', '#222222', '#e8493c', 'frame'], house: ['#f7f3ea', '#5a3e2b', '#9a6a4a', 'leaf'],
    board: ['#fffbe8', '#3a3328', '#f2a93b', 'cone'], warn: ['#ffd23f', '#2b2b2b', '#2b2b2b', 'bang'], sale: ['#ffffff', '#c0392b', '#c0392b', 'tag'],
  };
  function signTexture(text, style, sub) {
    const key = style + '|' + text + '|' + (sub || ''); let t = dynSignCache.get(key); if (t) return t;
    const [bg, fg, ac, icon] = SIGN_STYLE[style] || SIGN_STYLE.board;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = sub ? 160 : 100; const c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height); c.strokeStyle = ac; c.lineWidth = 6; c.strokeRect(7, 7, cv.width - 14, cv.height - 14);
    c.fillStyle = ac; const ix = 52, iy = sub ? 58 : 50; c.beginPath();
    if (icon === 'sun') { c.arc(ix, iy, 16, 0, PI * 2); c.fill(); for (let k = 0; k < 8; k++) { const a = k * PI / 4; c.fillRect(ix + Math.cos(a) * 25 - 3, iy + Math.sin(a) * 25 - 3, 6, 6); } }
    else if (icon === 'cup') { c.fillRect(ix - 16, iy - 12, 26, 26); c.arc(ix + 13, iy, 7, -PI / 2, PI / 2); c.fill(); }
    else if (icon === 'flower') { for (let k = 0; k < 5; k++) { const a = k * PI * 2 / 5; c.moveTo(ix, iy); c.arc(ix + Math.cos(a) * 13, iy + Math.sin(a) * 13, 10, 0, PI * 2); } c.fill(); }
    else if (icon === 'gear') { c.arc(ix, iy, 17, 0, PI * 2); c.fill(); for (let k = 0; k < 8; k++) { const a = k * PI / 4; c.fillRect(ix + Math.cos(a) * 20 - 5, iy + Math.sin(a) * 20 - 5, 10, 10); } c.fillStyle = bg; c.beginPath(); c.arc(ix, iy, 7, 0, PI * 2); c.fill(); }
    else if (icon === 'book') { c.fillRect(ix - 20, iy - 14, 18, 28); c.fillRect(ix + 2, iy - 14, 18, 28); }
    else if (icon === 'basket') { c.fillRect(ix - 20, iy - 2, 40, 18); c.arc(ix, iy - 2, 16, PI, 0); c.lineWidth = 5; c.strokeStyle = ac; c.stroke(); }
    else if (icon === 'fork') { c.fillRect(ix - 12, iy - 18, 5, 36); c.fillRect(ix - 18, iy - 18, 4, 14); c.fillRect(ix - 6, iy - 18, 4, 14); c.fillRect(ix + 8, iy - 18, 7, 36); }
    else if (icon === 'frame') { c.lineWidth = 7; c.strokeStyle = ac; c.strokeRect(ix - 18, iy - 15, 36, 30); }
    else if (icon === 'cone') { c.moveTo(ix, iy - 20); c.lineTo(ix + 15, iy + 18); c.lineTo(ix - 15, iy + 18); c.fill(); }
    else if (icon === 'bang') { c.moveTo(ix, iy - 22); c.lineTo(ix + 22, iy + 18); c.lineTo(ix - 22, iy + 18); c.fill(); c.fillStyle = bg; c.fillRect(ix - 2, iy - 8, 4, 14); c.fillRect(ix - 2, iy + 9, 4, 4); }
    else if (icon === 'tag') { c.moveTo(ix - 18, iy - 12); c.lineTo(ix + 8, iy - 12); c.lineTo(ix + 20, iy); c.lineTo(ix + 8, iy + 12); c.lineTo(ix - 18, iy + 12); c.fill(); }
    else { c.ellipse(ix, iy, 11, 20, .6, 0, PI * 2); c.fill(); }
    c.fillStyle = fg; c.textAlign = 'left'; c.textBaseline = 'middle';
    let size = 46; c.font = `700 ${size}px Georgia, "Times New Roman", serif`; while (c.measureText(text).width > 410 && size > 22) { size -= 2; c.font = `700 ${size}px Georgia, "Times New Roman", serif`; }
    c.fillText(text, 90, sub ? 58 : 52);
    if (sub) { c.font = '600 30px system-ui, sans-serif'; c.fillStyle = fg; c.globalAlpha = .8; let ss = 30; while (c.measureText(sub).width > 470 && ss > 16) { ss -= 2; c.font = `600 ${ss}px system-ui, sans-serif`; } c.fillText(sub, 24, 122); c.globalAlpha = 1; }
    t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; dynSignCache.set(key, t); return t;
  }
  function dynSign(text, style, x, y, z, w, ry = 0, sub = null) {
    if (!text) { box(W, P.woodD, x, y, z + .02, w + .14, w * .2 + .14, .08, ry, 0); return null; }
    const tex = signTexture(text, style, sub), h = w * tex.image.height / tex.image.width;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: .75 }));
    placeOnBase(m, x, y, z + .07, ry); m.receiveShadow = true; m.userData.dispose = true; (addTarget || scene).add(m);
    box(W, P.woodD, x, y, z + .02, w + .14, h + .14, .08, ry, 0);
    return m;
  }

  /* ================= LOCATIONS ================= */
  const fitBoxes = [], siteInfo = [];
  let bakeryChimney = null, fountainAt = null, clockAt = null, flagAt = null, pondAt = null, cafeLights = [];

  function oliversCottage(c) {
    const w = 6.4, d = 5.2, h = 3.0, thatch = 0xc99d5f, trim = 0x5f8a68;
    shell(w, d, h, c, { beams: 0x7a5236, trim: 0x7a5236 });
    for (const y of [1.2, 2.2]) { box(W, 0x7a5236, 0, y, d / 2 + .02, w, .12, .06, 0, .03); } // half-timber bands
    roof({ w, d, h0: h, rh: 2.9, oh: .65, ohe: .4, roof: thatch, wall: c });
    chimney(-2.0, -1.0, h, h + 2.5, 0x9d948a);
    door(0, d / 2, 1.1, 2.0, trim, { arch: true, frame: 0x7a5236 });
    for (const sx of [-1.95, 1.95]) win(sx, 1.75, d / 2, 1.0, 1.0, { shutter: trim, flowers: P.warm, frame: P.white });
    win(w / 2, 1.75, 0, .9, .9, { ry: PI / 2, shutter: trim }); win(-w / 2, 1.75, 0, .9, .9, { ry: -PI / 2, shutter: trim });
    GL.add(Geo.disc, P.glass, at(w / 2 + .45, h + 1.0, 0, PI / 2, .38, .38, .06)); W.add(Geo.disc, P.white, at(w / 2 + .43, h + 1.0, 0, PI / 2, .48, .48, .06));
    roof({ w: 1.8, d: 1.1, h0: 2.75, rh: .7, oh: .12, ohe: .12, roof: thatch, wall: c, along: 'z', z: d / 2 + .55 });
    for (const sx of [-.8, .8]) box(W, 0x7a5236, sx, 2.45, d / 2 + .9, .1, .7, .1, 0, 0);
    stones(0, d / 2 + .8, 7.0);
    picket(-9.6, 6.9, -.7, 6.9); picket(.7, 6.9, 4.1, 6.9); picket(-9.6, 6.9, -9.6, -1.5); picket(4.1, 6.9, 4.1, 3.4);
    for (let i = 0; i < 3; i++) { boxB(W, 0x7a5a3e, -6.4, 0, 3.4 + i * 1.1, 4.4, .2, .6, 0, .04); for (let k = 0; k < 6; k++) fol(Geo.ico0, pick([0x5fa04f, 0x7cbb5d, 0x9acb6a]), -8.2 + k * .72, .36, 3.4 + i * 1.1, .24, .2, .24, .2, .2); }
    for (const [x, z] of [[-8.6, 1.3], [-7.6, 1.7], [-6.5, 1.2]]) W.add(Geo.dode, 0xe8862e, at(x, .3, z, R(0, 6), .4, .32, .4), .05);
    keepL(-8.8, 2.8, -4, 6.6);
    flowers(2.4, 4.9, 26, 1.3, 1.3, P.flowers);
    roundTree(-7.6, -3.2, 1.15); roundTree(-9.2, -0.4, .85, P.leaf, 0xd8352a);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3 - i; k++) W.add(Geo.cyl8, 0x9b6a45, at(-4.3 + k * .32 + i * .16, .16 + i * .28, -2.9, 0, .15, .9, .15, PI / 2), .08);
    barrel(3.75, -1.8); crate(3.7, -2.8);
    shrub(-3.6, 3.4, .55); shrub(3.5, 2.9, .5);
  }
  function emmasHouse(c) {
    const w = 6.6, d = 5.4, h = 4.6, rc = 0x5f7d95, dc = 0x456b8f;
    shell(w, d, h, c, {});
    box(W, P.white, 0, 2.35, 0, w + .1, .14, d + .1, 0, .02);
    hip(w, d, h, 2.3, .5, rc);
    withT(0, 0, 0, 0, () => { boxB(W, c, 0, h - .2, d / 2 - .55, 1.5, 1.35, 1.3, 0, .02); roof({ w: 1.5, d: 1.3, h0: h + 1.15, rh: .65, oh: .14, ohe: .1, roof: rc, wall: c, along: 'z', z: d / 2 - .55 }); win(0, h + .5, d / 2 + .1, .7, .65, {}); });
    chimney(2.3, -1.1, h, h + 2.6);
    door(0, d / 2, 1.1, 2.0, dc, { transom: true, glassTop: true });
    for (const sx of [-2.05, 2.05]) { win(sx, 1.4, d / 2, 1.0, 1.15, { flowers: P.pinks }); win(sx, 3.45, d / 2, .9, .95, {}); }
    for (const s of [-1, 1]) { win(s * w / 2, 1.4, 0, .9, 1.1, { ry: s * PI / 2 }); win(s * w / 2, 3.45, 0, .8, .9, { ry: s * PI / 2 }); }
    // porch
    boxB(W, 0xb88a5e, 0, 0, d / 2 + .9, w + .4, .42, 1.8, 0, .03);
    for (let i = -6; i <= 6; i++) box(W, dark(0xb88a5e, .85), i * .55, .425, d / 2 + .9, .02, .01, 1.8, 0, 0);
    for (const sx of [-3.2, -.85, .85, 3.2]) cyl(W, P.white, sx, .42, d / 2 + 1.65, .1, 2.3, 8, .02);
    W.add(Geo.box, rc, at(0, 2.85, d / 2 + 1.0, 0, w + .8, .14, 2.2, .2), .03);
    for (const [a, b] of [[-3.2, -.85], [.85, 3.2]]) { box(W, P.white, (a + b) / 2, 1.3, d / 2 + 1.65, b - a, .08, .08, 0, 0); for (let x = a + .2; x < b; x += .24) box(W, P.white, x, .87, d / 2 + 1.65, .05, .8, .05, 0, 0); }
    boxB(W, 0xc9c1b1, 0, 0, d / 2 + 2.1, 1.6, .22, .6, 0, .03);
    bench(-2.0, d / 2 + .75, 0, .42);
    path(-.55, d / 2 + 2.4, .55, 7.2);
    hedge(-3.3, 6.9, -.8, 6.9); hedge(.8, 6.9, 4.2, 6.9);
    for (const sx of [-2.4, -1.4, 1.5, 2.6]) { shrub(sx, 5.6, .42, 0x4f8f4f); for (let i = 0; i < 5; i++) fol(Geo.octa, pick(P.pinks), sx + R(-.35, .35), R(.45, .7), 5.6 + R(-.3, .3), .08, .08, .08, .2, 0); }
    roundTree(3.6, 4.8, .78, [0xf2a7c3, 0xf7bfd3, 0xeea0bd]);
    mailbox(1.3, 7.3, 0x456b8f);
    pineTree(-2.6, -6.5, 1.0); shrub(2.4, -4.6, .6);
  }
  function sarahsHouse(c) {
    const w = 6.2, d = 6.0, h = 3.6, rc = 0xa44a3f;
    shell(w, d, h, c, {});
    roof({ kind: 'gambrel', w, d, h0: h, rh: 3.1, oh: .45, ohe: .3, roof: rc, wall: c, along: 'z' });
    GL.add(Geo.disc, P.glass, at(0, h + 1.35, d / 2 + .35, 0, .42, .42, .06)); W.add(Geo.disc, P.white, at(0, h + 1.35, d / 2 + .33, 0, .54, .54, .06));
    box(W, P.white, 0, h + 1.35, d / 2 + .39, .05, .84, .03, 0, 0); box(W, P.white, 0, h + 1.35, d / 2 + .39, .84, .05, .03, 0, 0);
    // bay window
    boxB(W, c, -1.45, .4, d / 2 + .42, 2.3, 2.15, .9, 0, .02); boxB(W, P.stone, -1.45, 0, d / 2 + .42, 2.4, .42, 1.0, 0, .02);
    win(-1.45, 1.5, d / 2 + .87, 1.7, 1.2, {}); win(-2.6, 1.5, d / 2 + .42, .6, 1.1, { ry: -PI / 2, mull: false }); win(-.3, 1.5, d / 2 + .42, .6, 1.1, { ry: PI / 2, mull: false });
    hip(2.3, .9, 2.55, .55, .12, rc, -1.45, d / 2 + .42);
    door(1.65, d / 2, 1.0, 2.05, 0xf2c14e, { glassTop: true });
    W.add(Geo.box, rc, at(1.65, 2.75, d / 2 + .45, 0, 1.6, .1, .9, .25), .03);
    for (const s of [-1, 1]) { win(s * w / 2, 1.5, -.9, .85, 1.05, { ry: s * PI / 2, shutter: 0x3f5f7a }); win(s * w / 2, 1.5, 1.4, .85, 1.05, { ry: s * PI / 2, shutter: 0x3f5f7a }); }
    stones(1.65, d / 2 + .8, 7.0);
    railFence(-4.3, 6.9, 1.0, 6.9); railFence(2.3, 6.9, 3.35, 6.9);
    flowers(-1.8, 6.15, 28, 2.4, .35, P.purples);
    pineTree(-3.5, 4.4, .9); poplar(-3.6, -1.0, 1.0);
    mailbox(2.0, 7.35, 0xd9493c);
    tableSet(1.6, -5.2, 2); rock(2.9, 4.6, .45); shrub(2.9, 3.6, .45);
  }
  function sharedHouse(c) {
    const rc = 0x55606b;
    withT(-1, 0, -.8, 0, () => {
      shell(7.0, 4.4, 3.6, c, {});
      roof({ w: 7.0, d: 4.4, h0: 3.6, rh: 2.2, oh: .5, ohe: .3, roof: rc, wall: c });
      const a = Math.atan2(2.2, 2.2 + .5);
      for (const sx of [-2.5, -.9]) { W.add(Geo.box, 0x2b3f5e, at(sx, 4.98, 1.15, 0, 1.4, .07, 1.5, a), .02); W.add(Geo.box, 0xb8c4cc, at(sx, 4.94, 1.15, 0, 1.5, .05, 1.6, a), 0); }
      chimney(2.1, -1.0, 3.6, 6.2, 0x8f8a80);
      door(-1.6, 2.2, 1.0, 2.0, 0xc0504d, { glassTop: true });
      win(-3.0, 1.55, 2.2, .85, 1.05, { flowers: P.warm }); win(-.2, 1.55, 2.2, .85, 1.05, { flowers: P.warm });
      for (const s of [-1, 1]) win(s * 3.5, 1.55, 0, .85, 1.0, { ry: s * PI / 2 });
    });
    withT(2.4, 0, 1.9, 0, () => {
      shell(3.2, 3.0, 3.6, shade(c, -.03), {});
      roof({ w: 3.2, d: 3.0, h0: 3.6, rh: 2.0, oh: .4, ohe: .3, roof: rc, wall: shade(c, -.03), along: 'z' });
      door(0, 1.5, .95, 2.0, 0x3f8f8a, { glassTop: true });
      win(0, 4.4, 1.5 + .32, .55, .6, {});
      for (const s of [-1, 1]) win(s * 1.6, 1.6, 0, .7, .95, { ry: s * PI / 2 });
    });
    path(-3.15, 3.0, -2.05, 7.2); path(1.9, 3.6, 2.9, 7.2);
    for (const [a, b] of [[-5.4, -3.2], [-2.0, 1.85], [2.95, 10]]) { boxB(W, 0xb6ab98, (a + b) / 2, 0, 6.95, b - a, .55, .45, 0, .05); for (let x = a + .3; x < b; x += .55) W.add(Geo.dode, pick([0xa9a090, 0xc0b7a6, 0x99917f]), at(x, .5, 6.95, R(0, 6), .26, .14, .22), .04); keepL(a, 6.6, b, 7.3); }
    for (let i = 0; i < 3; i++) { boxB(W, 0x8a5a3b, 6.0 + i * 1.4, 0, 3.6, 1.0, .35, 2.4, 0, .04); boxB(W, 0x5b3f2c, 6.0 + i * 1.4, .35, 3.6, .86, .02, 2.26, 0, 0); for (let k = 0; k < 4; k++) fol(Geo.ico0, pick([0x5fa04f, 0x7cbb5d, 0x9acb6a]), 6.0 + i * 1.4 + R(-.2, .2), .52, 2.7 + k * .6, .24, .22, .24, .25, .35); if (i === 1) for (let k = 0; k < 4; k++) W.add(Geo.ico0, 0xd8352a, at(6.0 + 1.4 + R(-.25, .25), .58, 2.7 + k * .6, 0, .09, .09, .09), .05); }
    keepL(5.3, 2.2, 9.6, 5.0);
    // clothesline
    for (const x of [5.4, 9.4]) cyl(W, P.woodD, x, 0, -.6, .06, 2.0, 6, 0);
    box(W, 0xdddddd, 7.4, 1.95, -.6, 4.0, .02, .02, 0, 0);
    [[0xd9493c, 6.0], [0xffffff, 6.8], [0x6fa8ff, 7.6], [0xffd166, 8.5]].forEach(([cc, x]) => box(W, cc, x, 1.62, -.6, .6, .65, .03, 0, .02));
    roundTree(8.6, 5.5, .9, P.leaf, 0xd8352a); pineTree(9.2, -4.2, 1.1);
    tableSet(7.4, -2.6, 4);
  }

  function bakery(c) {
    const w = 7.2, d = 5.6, h = 4.2, red = 0x8c3b2c;
    shell(w, d, h, c, { trim: 0xfff1d6 });
    hip(w, d, h, 2.0, .45, 0xc36d56);
    bakeryChimney = chimney(2.4, -1.4, h, h + 2.4);
    boxB(W, red, 0, 0, d / 2 + .06, w, .62, .14, 0, .02);
    for (const sx of [-3.55, -1.0, 1.0, 3.55]) box(W, red, sx, 1.6, d / 2 + .08, .24, 3.2, .16, 0, .02);
    for (const sx of [-2.25, 2.25]) {
      win(sx, 1.75, d / 2, 2.0, 1.6, { frame: red, mull: false });
      boxB(W, 0xe8d3b0, sx, .85, d / 2 + .12, 2.0, .1, .3, 0, .02);
      for (let k = 0; k < 6; k++) W.add(Geo.ico1, pick([0xc98a4b, 0xd9a05b, 0xb8743c]), at(sx - .8 + k * .32, 1.07, d / 2 + .16, R(0, 1), .15, .1, .12), .05);
      for (let k = 0; k < 2; k++) W.add(Geo.torus, 0xb8743c, at(sx - .5 + k, 1.4, d / 2 + .14, 0, .14, .14, .1), .05);
    }
    door(0, d / 2, 1.2, 2.25, red, { glassTop: true, frame: red });
    // striped awning with scalloped valance
    const n = 12, aw = w + .3;
    for (let i = 0; i < n; i++) { const x = -aw / 2 + aw / n * (i + .5), col = i % 2 ? 0xfff4e0 : 0xd9493c; W.add(Geo.box, col, at(x, 2.98, d / 2 + .62, 0, aw / n + .01, .06, 1.35, .42), 0); W.add(Geo.halfDisc, col, at(x, 2.68, d / 2 + 1.24, 0, aw / n / 2, -.2, .04), 0); }
    sign(0, 0, 3.62, d / 2 + .02, 3.6);
    box(W, P.iron, w / 2 + .35, 2.85, d / 2 - .2, .7, .06, .06, 0, 0); W.add(Geo.disc, 0xf2c14e, at(w / 2 + .55, 2.45, d / 2 - .2, PI / 2, .34, .34, .06), .02);
    for (const sx of [-.95, .95]) { GL.add(Geo.box, 0xffe2a8, at(sx, 2.25, d / 2 + .2, 0, .18, .28, .18), 0); box(W, P.iron, sx, 2.44, d / 2 + .2, .24, .06, .24, 0, 0); }
    for (const sx of [-1.35, 1.35]) pot(sx, d / 2 + .55, .22, P.warm);
    // patio
    path(-10.0, -1.6, -4.4, 4.6, 0xd9c7a6);
    tableSet(-6.0, 2.6, 2, 0xd9493c); tableSet(-8.6, 2.6, 2); tableSet(-7.2, .0, 3, 0xfff4e0);
    planter(-7.2, 4.2, 4.2, .5, P.warm);
    boxB(W, 0x3a3a3a, 3.0, 0, 4.6, .7, .9, .08, 0, 0); box(W, 0x2b2b2b, 3.0, .55, 4.62, .6, .6, .03, 0, 0); box(W, P.white, 3.0, .7, 4.65, .4, .04, .02, 0, 0);
    crate(2.6, -3.6); crate(3.2, -3.4, .4); barrel(1.6, -3.7, 0xb08860);
    roundTree(-9.6, -3.0, 1.05, P.autumn); shrub(-4.6, -2.6, .55);
  }
  function florist(c) {
    const w = 6.6, d = 5.4, h = 4.1, green = 0x4f7a5a;
    shell(w, d, h, c, {});
    roof({ kind: 'mansard', w, d, h0: h, rh: 2.0, oh: .4, ohe: .25, roof: green, wall: c });
    for (const sx of [-1.7, 1.7]) { boxB(W, green, sx, h + .2, d / 2 - .1, 1.0, 1.0, .7, 0, .02); hip(1.0, .7, h + 1.2, .45, .12, green, sx, d / 2 - .1); win(sx, h + .7, d / 2 + .25, .55, .55, {}); }
    for (const sx of [-2.0, 2.0]) win(sx, 1.75, d / 2, 1.35, 1.35, { arch: true, flowers: P.flowers, boxColor: green });
    door(0, d / 2, 1.1, 2.1, green, { arch: true, glassTop: true });
    W.add(Geo.box, green, at(0, 3.05, d / 2 + .45, 0, 1.9, .07, .9, .3), .02);
    sign(1, 0, 3.62, d / 2 + .02, 3.4);
    for (const sx of [-2.75, 2.75]) {
      for (let t = 0; t < 3; t++) boxB(W, P.woodL, sx, 0, d / 2 + 1.0 + t * .45, 1.3, .7 - t * .22, .45, 0, .04);
      for (let t = 0; t < 3; t++) for (let k = 0; k < 3; k++) { const x = sx - .4 + k * .4, y = .7 - t * .22, z = d / 2 + 1.0 + t * .45; cyl(W, pick([0xc06a45, 0xe0e0e0, 0x6f8fa8]), x, y, z, .13, .2, 8, .05); for (let f = 0; f < 4; f++) fol(Geo.octa, pick(P.flowers), x + R(-.1, .1), y + .3, z + R(-.1, .1), .08, .075, .08, .4, y + .2); fol(Geo.ico0, 0x5fa04f, x, y + .24, z, .13, .1, .13, .3, y + .2); }
      keepL(sx - .7, d / 2 + .7, sx + .7, d / 2 + 2.3);
      flowerSpots.push([wx(sx), wz(d / 2 + 1.5)]);
    }
    for (const sx of [-.95, .95]) pot(sx, d / 2 + .5, .25, P.pinks);
    for (const s of [-1, 1]) { box(W, P.iron, s * (w / 2 + .3), 3.05, d / 2 + .1, .6, .05, .05, 0, 0); fol(Geo.ico1, 0x4f9358, s * (w / 2 + .55), 2.6, d / 2 + .1, .3, .28, .3, .3, 2.3); for (let f = 0; f < 6; f++) fol(Geo.octa, pick(P.flowers), s * (w / 2 + .55) + R(-.28, .28), 2.55 + R(-.2, .2), d / 2 + .1 + R(-.25, .25), .07, .07, .07, .4, 2.3); }
    for (const s of [-1, 1]) win(s * w / 2, 1.75, 0, 1.0, 1.1, { ry: s * PI / 2, arch: true });
    roundTree(-3.3, -5.4, .9, [0xf2a7c3, 0xf7bfd3]); shrub(2.8, -4.2, .5);
  }
  function cafe(c) {
    const w = 7.0, d = 5.6, h = 4.4, brown = 0x6e4a35;
    shell(w, d, h, c, { trim: brown });
    boxB(W, dark(c, .85), 0, h, 0, w + .3, .5, d + .3, 0, .02); boxB(W, 0x7d746a, 0, h, 0, w - .3, .52, d - .3, 0, .02);
    box(W, brown, 0, 2.55, 0, w + .12, .12, d + .12, 0, .02);
    for (const sx of [-2.15, 2.15]) win(sx, 1.55, d / 2, 1.9, 1.45, { frame: brown });
    for (const sx of [-2.15, 2.15]) win(sx, 3.62, d / 2, .85, .75, { frame: brown, flowers: P.warm, boxColor: brown });
    door(0, d / 2, 1.15, 2.1, brown, { glassTop: true, frame: brown });
    sign(2, 0, 3.0, d / 2 + .02, 2.6);
    for (const sx of [-.95, .95]) { GL.add(Geo.box, 0xffd78f, at(sx, 2.15, d / 2 + .2, 0, .18, .28, .18), 0); box(W, P.iron, sx, 2.34, d / 2 + .2, .24, .06, .24, 0, 0); }
    // rooftop coffee cup
    cyl(W, P.white, -1.8, h + .5, .8, .75, .08, 16, 0); cyl(W, P.white, -1.8, h + .58, .8, .5, .85, 12, 0); cyl(W, 0x4a2c1d, -1.8, h + 1.4, .8, .44, .04, 12, 0);
    W.add(Geo.torus, P.white, at(-1.2, h + 1.0, .8, 0, .26, .26, .26), 0);
    boxB(W, 0x9b9b9b, 2.0, h + .5, -1.4, .8, .6, .8, 0, .03); // roof vent
    // patio deck
    for (let i = 0; i < 12; i++) boxB(W, 0xb98a5f, 4.15 + i * .47, 0, 1.0, .45, .12, 7.8, 0, .07);
    keepL(3.9, -2.9, 9.8, 4.9);
    tableSet(5.5, 3.0, 2, 0xfff4e0); tableSet(8.3, 3.0, 2, 0x5f8a68); tableSet(5.5, -.6, 3, 0xe8b45a); tableSet(8.3, -.6, 2, 0xd9493c);
    planter(7.0, 4.75, 5.4, .45, P.warm);
    for (const z of [4.6, -2.6]) cyl(W, P.woodD, 9.75, 0, z, .07, 3.2, 6, 0);
    const lines = [[[3.6, 3.6, 2.85], [9.75, 3.15, 4.6]], [[3.6, 3.6, -2.75], [9.75, 3.15, -2.6]], [[9.75, 3.15, 4.6], [9.75, 3.15, -2.6]]];
    for (const [a, b] of lines) { const n = 9; for (let i = 0; i <= n; i++) { const u = i / n, sag = Math.sin(u * PI) * .45, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u - sag, z = a[2] + (b[2] - a[2]) * u; GL.add(Geo.octa, 0xffe6a8, at(x, y - .1, z, 0, .09, .12, .09), 0); cafeLights.push([wx(x), wz(z)]); if (i < n) { const u2 = (i + .5) / n, x2 = a[0] + (b[0] - a[0]) * u2, z2 = a[2] + (b[2] - a[2]) * u2, y2 = a[1] + (b[1] - a[1]) * u2 - Math.sin(u2 * PI) * .45; const L = Math.hypot((b[0] - a[0]) / n, (b[2] - a[2]) / n, (b[1] - a[1]) / n); box(W, 0x333333, x2, y2, z2, .02, .02, L + .02, Math.atan2(b[0] - a[0], b[2] - a[2]), 0); } } }
    boxB(W, 0x3a3a3a, -2.7, 0, 4.7, .7, .9, .08, 0, 0); box(W, 0x2b2b2b, -2.7, .55, 4.72, .6, .6, .03, 0, 0);
    pineTree(9.0, -5.6, .95); barrel(-2.8, -3.6); shrub(-3.9, -4.5, .5);
  }
  function townHall(c) {
    const stone = 0xeee8da, rc = 0x6f86a8, wht = 0xffffff;
    boxB(W, 0xd6cfbf, 0, 0, -.35, 7.0, .62, 6.6, 0, .02);
    withT(0, .6, -.45, 0, () => { shell(6.4, 5.2, 3.8, stone, { stone: 0xd6cfbf, trim: wht }); box(W, wht, 0, 3.86, 0, 6.8, .22, 5.6, 0, .01); hip(6.4, 5.2, 3.95, 1.0, .35, rc); });
    keepL(-3.6, -3.8, 3.6, 4.7);
    // clock tower
    boxB(W, stone, 0, 4.3, -.6, 2.3, 3.3, 2.3, 0, .01); box(W, wht, 0, 7.62, -.6, 2.55, .2, 2.55, 0, 0);
    for (const s of [-1, 1]) win(s * 1.16, 5.2, -.6, .5, .8, { ry: s * PI / 2, arch: true });
    W.add(Geo.disc, 0x2f466b, at(0, 6.55, .56, 0, .86, .86, .06), 0); W.add(Geo.disc, 0xfffaf0, at(0, 6.55, .6, 0, .74, .74, .06), 0);
    for (let k = 0; k < 12; k++) { const a = k * PI / 6; box(W, 0x2f466b, Math.sin(a) * .6, 6.55 + Math.cos(a) * .6, .64, k % 3 ? .04 : .07, k % 3 ? .1 : .16, .02, 0, 0, 0, -a); }
    clockAt = new THREE.Vector3(wx(0), wy(6.55), wz(.66));
    for (const [dx, dz] of [[-.95, -1.55], [.95, -1.55], [-.95, .35], [.95, .35]]) box(W, stone, dx, 8.3, dz, .3, 1.25, .3, 0, .01);
    GL.add(Geo.box, 0xffe2a8, at(0, 8.1, -.6, 0, .5, .6, .5), 0); cone(W, 0xc9a24a, 0, 7.75, -.6, .3, .35, 8, 0);
    box(W, wht, 0, 8.98, -.6, 2.5, .16, 2.5, 0, 0); cone(W, rc, 0, 9.05, -.6, 1.6, 1.9, 4, .02);
    cyl(W, 0xc9a24a, 0, 10.9, -.6, .04, 1.5, 6, 0); flagAt = new THREE.Vector3(wx(0), 12.1, wz(-.6));
    // portico
    boxB(W, 0xd8d2c4, 0, 0, 3.55, 5.0, .42, 1.2, 0, .02); boxB(W, 0xd8d2c4, 0, 0, 4.25, 5.2, .21, .9, 0, .02);
    for (const sx of [-2.0, -.72, .72, 2.0]) { boxB(W, wht, sx, .6, 2.6, .58, .16, .58, 0, 0); cyl(W, wht, sx, .76, 2.6, .21, 3.05, 10, .01); boxB(W, wht, sx, 3.8, 2.6, .58, .14, .58, 0, 0); }
    boxB(W, wht, 0, 3.94, 2.45, 5.0, .55, .95, 0, .01);
    W.add(ex([[-2.65, 0], [2.65, 0], [0, 1.05]]), wht, at(0, 4.49, 2.45, 0, 1, 1, .9), .01);
    W.add(ex([[-2.2, .1], [2.2, .1], [0, .85]]), 0xdfe6f2, at(0, 4.49, 2.92, 0, 1, 1, .05), 0);
    W.add(Geo.disc, 0xc9a24a, at(0, 4.85, 2.96, 0, .22, .22, .04), 0);
    sign(3, 0, 4.21, 2.92, 2.5);
    door(0, 2.15, 1.5, 2.45, 0x5a3e2b, { y0: .6, transom: true, stepColor: 0xd6cfbf });
    for (const sx of [-2.75, 2.75]) win(sx, 2.55, 2.15, .75, 1.55, { arch: true });
    for (const s of [-1, 1]) for (const z of [-2.0, .1]) win(s * 3.2, 2.55, z - .45 + .45, .8, 1.5, { ry: s * PI / 2, arch: true });
    // formal garden + plaza
    path(-1.25, 4.7, 1.25, 12.0, 0xddd4c2);
    for (const s of [-1, 1]) {
      hedge(s * 1.55, 5.0, s * 1.55, 11.4, .38); hedge(s * 3.35, 5.0, s * 3.35, 11.4, .38);
      flowers(s * 2.45, 6.3, 18, .5, .9, P.flowers); flowers(s * 2.45, 9.6, 18, .5, .9, s < 0 ? P.pinks : P.warm);
      pot(s * 1.95, 4.75, .28); lamp(s * 1.6, 12.0 - .5);
      cone(W, 0x3f7f4f, s * 2.45, .0, 8.0, .45, 1.4, 8, .03); // topiary
      fol(Geo.ico1, 0x4c8c4f, s * 2.45, 1.75, 8.0, .4, .4, .4, .05, 1.4);
    }
    boxB(W, 0xd6cfbf, 0, 0, 10.2, 1.0, 1.1, 1.0, 0, .02); boxB(W, 0x8a7a55, 0, 1.1, 10.2, .5, .25, .5, 0, .02);
    cyl(W, 0x8a7a55, 0, 1.35, 10.2, .2, .8, 8, .02); W.add(Geo.ico1, 0x8a7a55, at(0, 2.35, 10.2, 0, .2, .22, .2), .02); W.add(Geo.box, 0x8a7a55, at(.22, 1.95, 10.2, 0, .1, .6, .1, 0, -.6), .02);
    keepL(-.7, 9.5, .7, 10.9);
    roundTree(-4.0, -4.0, 1.0); roundTree(3.2, -4.6, .9, P.autumn); poplar(-4.0, 1.0, .9);
  }
  function park() {
    path(-.65, -7.3, .65, 5.3); path(-3.4, -.65, 4.4, .65);
    cyl(W, 0xd9cbb0, 0, 0, 0, 2.1, .05, 16, .01); cyl(W, 0xe6dbc4, 0, 0, 0, 1.3, .06, 16, .01); cyl(W, 0xcfc0a2, 0, 0, 0, .45, .07, 12, .01);
    keepL(-2.2, -2.2, 2.2, 2.2);
    // fountain
    withT(0, 0, -4.5, 0, () => {
      cyl(W, 0xd9cbb0, 0, 0, 0, 2.05, .05, 16, 0);
      cyl(W, 0xb9b2a4, 0, 0, 0, 1.65, .5, 16, .02); cyl(W, 0xcfc8b8, 0, .5, 0, 1.7, .08, 16, 0);
      cyl(W, 0xb9b2a4, 0, .4, 0, .26, 1.05, 8, .02); cyl(W, 0xcfc8b8, 0, 1.4, 0, .7, .14, 12, .02); cone(W, 0xb9b2a4, 0, 1.2, 0, .3, .22, 8, .02);
      cyl(W, 0xb9b2a4, 0, 1.54, 0, .1, .35, 6, 0);
      fountainAt = new THREE.Vector3(wx(0), 0, wz(0));
      keepL(-2.1, -2.1, 2.1, 2.1);
    });
    for (const [x, z] of [[1.55, 1.55], [-1.55, 1.55], [1.55, -1.55], [-1.55, -1.55]]) bench(x * 1.15, z * 1.15, Math.atan2(-x, -z));
    lamp(-1.0, 3.0); lamp(1.0, -2.9); lamp(-1.0, -6.6); lamp(3.6, 1.0);
    roundTree(-2.4, -6.4, 1.05); roundTree(3.2, -6.3, 1.0, P.autumn); roundTree(-2.3, 3.9, .95, P.autumn); roundTree(3.3, 3.8, 1.05);
    for (const [x, z, pal] of [[-2.4, 1.6, P.pinks], [2.9, 1.6, P.warm], [-2.4, -1.6, P.purples], [2.9, -1.7, P.flowers]]) { flowers(x, z, 16, .7, .45, pal); }
    for (const [x, z] of [[-3.0, -3.8], [3.9, -3.9], [-3.0, 5.0], [4.0, 4.9], [1.8, -7.0], [-1.9, -7.0]]) shrub(x, z, .5);
    rock(3.4, -2.6, .45); rock(-3.1, 2.7, .4);
    // entrance arch
    for (const s of [-1, 1]) { boxB(W, P.woodD, s * 1.05, 0, 5.05, .22, 2.9, .22, 0, .03); fol(Geo.ico0, 0x4f9358, s * 1.05, 2.0, 5.05, .3, .5, .3, .1, 0); }
    box(W, P.woodD, 0, 2.95, 5.05, 2.6, .16, .3, 0, .02);
    sign(4, 0, 2.55, 5.12, 1.95);
  }
  function pond() { // decorative north-west lot
    cyl(W, 0xd9c49a, 0, 0, 0, 4.9, .05, 16, .02, 3.6);
    pondAt = new THREE.Vector3(wx(0), .14, wz(0));
    for (let i = 0; i < 20; i++) { const a = i / 20 * PI * 2 + R(-.1, .1); rock(Math.cos(a) * 4.55, Math.sin(a) * 3.3, R(.3, .55)); }
    for (let i = 0; i < 12; i++) { const a = R(2.3, 3.9), x = Math.cos(a) * 4.0, z = Math.sin(a) * 2.9; for (let k = 0; k < 3; k++) fol(Geo.cone4, 0x6a9a4a, x + R(-.15, .15), .55, z + R(-.15, .15), .04, 1.1, .04, .5, 0, R(0, 6)); fol(Geo.box, 0x7a5236, x, 1.05, z, .07, .2, .07, .5, 0); }
    for (const [x, z] of [[1.0, -.8], [-1.2, .9], [2.2, 1.0], [-.4, -1.6]]) { cyl(W, 0x4f9358, x, .14, z, .42, .03, 10, .05, .38); W.add(Geo.octa, 0xffb3c8, at(x + .1, .26, z, 0, .1, .09, .1), .02); }
    for (let i = 0; i < 6; i++) boxB(W, 0xb98a5f, 3.0 + i * .02, .1, -1.1 + i * .42, 2.2, .08, .38, 0, .06);
    for (const z of [-1.2, 1.2]) cyl(W, P.woodD, 4.0, -.2, z, .07, .55, 6, 0);
    keepL(-5.0, -3.8, 5.0, 3.8);
    bench(0, 4.6, PI); roundTree(-5.2, 4.8, 1.1); poplar(5.6, 4.9); pineTree(-6.0, -4.0, 1.05);
  }
  function communityGarden() {
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
      const x = -2.4 + k * 2.3, z = -1.6 + r * 3.6; boxB(W, 0x8a5a3b, x, 0, z, 1.7, .4, 2.4, 0, .05); boxB(W, 0x5b3f2c, x, .4, z, 1.55, .02, 2.25, 0, 0);
      for (let i = 0; i < 6; i++) { const px = x + (i % 2 ? .38 : -.38), pz = z - .8 + Math.floor(i / 2) * .8; if ((r + k) % 3 === 0) W.add(Geo.dode, 0xe8862e, at(px, .6, pz, R(0, 6), .3, .24, .3), .05); else fol(Geo.ico0, pick([0x5fa04f, 0x7cbb5d, 0x9acb6a]), px, .6, pz, .28, .26, .28, .25, .42); }
    }
    keepL(-3.4, -3.0, 4.1, 3.2);
    withT(3.8, 0, -4.2, 0, () => { shell(2.0, 1.8, 2.0, 0x8fa8b8, { trim: P.white }); roof({ w: 2.0, d: 1.8, h0: 2.0, rh: .9, oh: .2, ohe: .15, roof: 0xa44a3f, wall: 0x8fa8b8 }); door(0, .9, .7, 1.4, 0x5a3e2b, { y0: .2 }); });
    // scarecrow
    cyl(W, P.woodD, -3.6, 0, 3.6, .05, 1.8, 6, 0); box(W, P.woodD, -3.6, 1.35, 3.6, 1.2, .07, .07, 0, 0); boxB(W, 0x5f7d95, -3.6, .9, 3.6, .45, .55, .22, 0, .02); W.add(Geo.ico1, 0xe8c27a, at(-3.6, 1.72, 3.6, 0, .2, .22, .2), .02); cone(W, 0xc99d5f, -3.6, 1.85, 3.6, .32, .32, 8, .03);
    railFence(-4.6, -5.6, 4.9, -5.6); railFence(-4.6, 5.0, -1.0, 5.0); railFence(1.0, 5.0, 4.9, 5.0); railFence(-4.6, -5.6, -4.6, 5.0); railFence(4.9, -5.6, 4.9, 5.0);
    barrel(3.6, 3.6, 0x6f8fa8); crate(3.8, 2.6);
  }
  function orchard() {
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) roundTree(-4.6 + k * 3.6, -3.4 + r * 4.4, .82, P.leaf, k % 2 ? 0xd8352a : 0xe9a23b);
    for (let i = 0; i < 6; i++) for (let k = 0; k < 6; k++) boxB(W, (i + k) % 2 ? 0xd9493c : P.white, 1.0 + i * .3, 0, 5.3 + k * .3, .3, .02, .3, 0, 0);
    boxB(W, 0xb98a5f, 1.5, .02, 5.7, .5, .3, .35, 0, .03); W.add(Geo.torus, 0x8a5a3b, at(1.5, .38, 5.7, 0, .18, .18, .18), 0);
    keepL(.8, 5.1, 2.9, 7.1);
    for (const [x, z] of [[-5.5, 6.0], [-3.9, 6.3]]) W.add(Geo.cyl12, 0xe3c56a, at(x, .55, z, .3, .55, 1.1, .55, 0, PI / 2), .05);
    flowers(-1.0, 6.2, 22, 1.4, .7, P.flowers); flowers(5.0, 6.4, 18, 1.2, .6, P.purples);
    railFence(-6.5, -6.0, 8.5, -6.0);
  }

  const builders = { 'Oliver’s Cottage': oliversCottage, 'Emma’s House': emmasHouse, 'Sarah’s House': sarahsHouse, 'Shared House': sharedHouse, 'Sunrise Bakery': bakery, 'Willowbrook Park': park, 'Petal & Stem': florist, 'Corner Café': cafe, 'Town Hall': townHall };
  // Commercial plots and open lots are built into their own batches so they can be replaced later.
  const DYN_SITE = { 4: 'P005', 6: 'P007', 7: 'P008' };
  const plotOrig = {}; let savedBatches = null;
  function beginPlot(pid) { savedBatches = { W, F, GL, rnd }; W = new Batch(); F = new Batch(); GL = new Batch(); addTarget = new THREE.Group(); addTarget.name = 'plot:' + pid + ':original'; }
  function endPlot(pid, extra = {}) { plotOrig[pid] = { W, F, GL, group: addTarget, ...extra }; ({ W, F, GL, rnd } = savedBatches); addTarget = null; }
  sites.forEach(([x, z, name, col], i) => {
    track = new THREE.Box3();
    const pid = DYN_SITE[i]; if (pid) beginPlot(pid);
    const lights0 = cafeLights.length;
    withT(x, 0, z, 0, () => builders[name](col));
    if (pid) endPlot(pid, { lights: cafeLights.slice(lights0) });
    // fit the camera to the buildings themselves (not yards); park uses its footprint
    const core = track.clone(); core.min.x = Math.max(core.min.x, x - 4.3); core.max.x = Math.min(core.max.x, x + 4.3); core.min.z = Math.max(core.min.z, z - 3.6); core.max.z = Math.min(core.max.z, z + 4.6);
    siteInfo.push({ name, x, z, box: core, full: track.clone() });
    track = null;
  });
  withT(-23, 0, 21, 0, pond);
  beginPlot('P010'); withT(-6.5, 0, 20.5, 0, communityGarden); endPlot('P010');
  beginPlot('P011'); withT(22.5, 0, 20.5, 0, orchard); endPlot('P011');

  /* ---------- lamps along the streets ---------- */
  for (const xr of vRoads) for (const zr of hRoads) for (const [sx, sz] of [[-1, -1], [1, 1]]) lamp(xr + sx * (RV + .55), zr + sz * (RH + .55));
  for (const z of hRoads) for (const x of [-25, 25]) lamp(x, z + RH + .55);

  /* ---------- rim trees, rocks and grass ---------- */
  for (let i = 0; i < 160; i++) {
    const side = i % 4, u = R(-30.5, 30.5), d = R(29.4, 31.2);
    const [x, z] = side === 0 ? [u, d] : side === 1 ? [u, -d] : side === 2 ? [d, u] : [-d, u];
    if (!free(x, z, .9)) continue;
    if (Math.abs(z + 10) < 2.8 || Math.abs(z - 8) < 2.8) if (Math.abs(x) > 28) continue;
    if (z > 28 && x > 2 && x < 12) continue;
    const r = rnd();
    if (r < .38) roundTree(x, z, R(.8, 1.2), rnd() < .3 ? P.autumn : P.leaf); else if (r < .62) pineTree(x, z, R(.8, 1.25)); else if (r < .7) poplar(x, z, R(.85, 1.1));
    else if (r < .85) shrub(x, z, R(.45, .8)); else rock(x, z, R(.4, .9));
  }
  for (let i = 0; i < 40; i++) { const x = R(-29, 29), z = R(-31, -24.5); if (free(x, z, .9)) (rnd() < .5 ? roundTree : pineTree)(x, z, R(.8, 1.15)); }
  let tufts = 0, wild = 0;
  for (let i = 0; i < 2600 && (tufts < 340 || wild < 120); i++) {
    const x = R(-31.2, 31.2), z = R(-31.2, 31.2); if (!free(x, z, .25)) continue;
    if (tufts < 340) { tuft(x, z, R(.8, 1.3)); tufts++; } else { flowers(x, z, 3, .25, .25, P.flowers); wild++; }
  }

  /* ================= MATERIALS & MESHES ================= */
  const sway = { value: 0 };
  function swayify(mat) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = sway;
      sh.vertexShader = 'attribute float sway;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 swp = modelMatrix * vec4(transformed, 1.0);
        transformed.x += sin(uTime * 1.7 + swp.x * .35 + swp.z * .22) * sway * .045;
        transformed.z += cos(uTime * 1.3 + swp.z * .31 + swp.x * .17) * sway * .03;`);
    };
    return mat;
  }
  const worldMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .88, metalness: 0 });
  const folMat = swayify(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .9 }));
  const folDepth = swayify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  const glowMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .25, metalness: .1, emissive: 0xffc46b, emissiveIntensity: 0 });
  const mk = (geo, mat, cast, recv, name) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; m.name = name; m.matrixAutoUpdate = false; scene.add(m); return m; };
  const worldMesh = mk(W.geometry(), worldMat, true, true, 'world');
  const folMesh = mk(F.geometry(true), folMat, true, true, 'foliage'); folMesh.customDepthMaterial = folDepth;
  const glowMesh = mk(GL.geometry(), glowMat, false, true, 'glow');

  // water
  const waterMat = new THREE.MeshStandardMaterial({ color: P.water, roughness: .12, metalness: .1, transparent: true, opacity: .88, emissive: 0x2a7f9a, emissiveIntensity: .25, flatShading: true });
  const waters = [];
  const addWater = (x, y, z, rx, rz) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .04, 20), waterMat); m.position.set(x, y, z); m.scale.set(rx, 1, rz); m.receiveShadow = true; scene.add(m); waters.push(m); return m; };
  addWater(fountainAt.x, .46, fountainAt.z, 1.45, 1.45); addWater(fountainAt.x, 1.52, fountainAt.z, .6, .6); addWater(pondAt.x, .1, pondAt.z, 4.35, 3.1);

  // light pools under lamps and café string lights (night)
  const poolTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.45, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffb35c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  function poolMesh(spots) {
    const pg = new THREE.BufferGeometry(), pp = [], pu = [];
    for (const [x, z, r] of spots) { const q = [[-r, -r], [r, -r], [r, r], [-r, -r], [r, r], [-r, r]]; for (const [a, b] of q) { pp.push(x + a, .17, z + b); pu.push(a > 0 ? 1 : 0, b > 0 ? 0 : 1); } }
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2));
    const m = new THREE.Mesh(pg, poolMat); m.renderOrder = 2; m.name = 'lightPools'; return m;
  }
  scene.add(poolMesh(lampSpots));
  // the plots' own meshes (original buildings), with clipping-capable materials for staged demolition
  const glowMats = [glowMat];
  const plotMats = {};
  function matsFor(key) {
    if (plotMats[key]) return plotMats[key];
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4), cp = [plane];
    const m = {
      plane,
      world: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .88, metalness: 0, clippingPlanes: cp }),
      fol: swayify(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .9, clippingPlanes: cp })),
      folDepth: swayify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, clippingPlanes: cp })),
      depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, clippingPlanes: cp }),
      glow: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .25, metalness: .1, emissive: 0xffc46b, emissiveIntensity: 0, clippingPlanes: cp }),
    };
    glowMats.push(m.glow); return (plotMats[key] = m);
  }
  function meshesInto(group, b, mats, name) {
    const out = [];
    if (b.W.parts.length) { const m = new THREE.Mesh(b.W.geometry(), mats.world); m.castShadow = m.receiveShadow = true; m.customDepthMaterial = mats.depth; m.name = name; group.add(m); out.push(m); }
    if (b.F.parts.length) { const m = new THREE.Mesh(b.F.geometry(true), mats.fol); m.castShadow = m.receiveShadow = true; m.customDepthMaterial = mats.folDepth; group.add(m); out.push(m); }
    if (b.GL.parts.length) { const m = new THREE.Mesh(b.GL.geometry(), mats.glow); m.receiveShadow = true; group.add(m); out.push(m); }
    return out;
  }
  for (const [pid, o] of Object.entries(plotOrig)) {
    meshesInto(o.group, o, matsFor(pid + ':o'), 'plot:' + pid);
    if (o.lights?.length) o.group.add(poolMesh(o.lights.filter((_, i) => i % 3 === 0).map(([x, z]) => [x, z, 1.8])));
    scene.add(o.group);
  }

  /* ================= AMBIENT ANIMATION ================= */
  const dummy = new THREE.Object3D();
  // fountain spray
  const drops = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xd4f1ff, roughness: .1, transparent: true, opacity: .85, emissive: 0x3a8fb0, emissiveIntensity: .3 }), 20); scene.add(drops);
  // bakery chimney smoke
  const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 1, flatShading: true, transparent: true, opacity: .7, depthWrite: false }), 7); scene.add(smoke);
  // butterflies (day) and fireflies (night)
  const wingGeo = new THREE.PlaneGeometry(.26, .2).rotateX(-PI / 2).translate(0, 0, .13);
  const wingMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .8 });
  const NB = 10, wingsR = new THREE.InstancedMesh(wingGeo, wingMat, NB), wingsL = new THREE.InstancedMesh(wingGeo, wingMat, NB);
  const bfly = Array.from({ length: NB }, (_, i) => { const s = flowerSpots[Math.floor(rnd() * flowerSpots.length)] || [0, 0]; const c = new THREE.Color(pick([0xffd166, 0xffffff, 0xff9f43, 0x9fd3ff, 0xffb3c8])); wingsR.setColorAt(i, c); wingsL.setColorAt(i, c); return { x: s[0], z: s[1], ph: R(0, 10), r: R(.6, 1.6), sp: R(.4, .8) }; });
  scene.add(wingsR, wingsL);
  const NF = 26, flies = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xfff4a0, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }), NF);
  const fly = Array.from({ length: NF }, (_, i) => { const a = i < 14 ? [-7, -1.5, 4, 5] : i < 22 ? [-23, 21, 5, 4] : [22.5, 20.5, 6, 5]; return { x: a[0] + R(-a[2], a[2]), z: a[1] + R(-a[3], a[3]), ph: R(0, 20) }; });
  scene.add(flies);
  // ducks
  const duckB = new Batch(); const sb = base.clone(); base.identity();
  duckB.add(Geo.ico1, 0xf4efe4, at(0, .22, 0, 0, .36, .22, .24), 0); duckB.add(Geo.ico1, 0x2f6b4a, at(.27, .44, 0, 0, .14, .14, .13), 0); duckB.add(Geo.cone4, 0xf2a93b, at(.45, .42, 0, 0, .06, .14, .05, 0, -PI / 2), 0); duckB.add(Geo.cone4, 0xe8e0d0, at(-.33, .3, 0, 0, .1, .16, .1, 0, PI / 2.6), 0);
  base.copy(sb);
  const ducks = new THREE.InstancedMesh(duckB.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .8 }), 3); ducks.castShadow = true; scene.add(ducks);
  // clouds: visible ones drift around the horizon, invisible ones cast slow shadows over town
  const cloudB = new Batch(); base.identity();
  [[0, 0, 0, 2.2], [1.9, -.3, .3, 1.6], [-1.8, -.4, -.2, 1.5], [.6, .5, -.8, 1.4], [-.7, .3, .9, 1.3]].forEach(([x, y, z, r]) => cloudB.add(Geo.ico1, 0xffffff, at(x, y, z, R(0, 6), r, r * .72, r), 0));
  base.copy(sb);
  const cloudGeo = cloudB.geometry();
  const clouds = new THREE.InstancedMesh(cloudGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, emissive: 0xffffff, emissiveIntensity: .15 }), 6); scene.add(clouds);
  const cloudSet = Array.from({ length: 6 }, (_, i) => ({ a: i / 6 * PI * 2 + R(-.3, .3), r: R(40, 50), y: R(-7, -3.5), s: R(1.6, 2.4) })); // a sea of clouds below the floating diorama
  // flag
  const flagGeo = new THREE.PlaneGeometry(1.1, .66, 8, 2).translate(.55, 0, 0), flagBase = flagGeo.attributes.position.array.slice();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0x3f6fae, side: THREE.DoubleSide, roughness: .8, flatShading: true })); flag.position.copy(flagAt).add(new THREE.Vector3(0, -.15, 0)); flag.castShadow = true; scene.add(flag);
  // clock hands (follow game time)
  const handMat = new THREE.MeshStandardMaterial({ color: 0x2f466b, roughness: .6 });
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(.07, .38, .03).translate(0, .16, 0), handMat), minHand = new THREE.Mesh(new THREE.BoxGeometry(.05, .58, .03).translate(0, .25, 0), handMat);
  for (const h of [hourHand, minHand]) { h.position.copy(clockAt); scene.add(h); } minHand.position.z += .02;

  /* ================= LIGHTING ================= */
  const hemi = new THREE.HemisphereLight(0xdff0ff, 0x7a9a63, 1.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
  sun.castShadow = opts.shadows !== false;
  const sm = opts.shadowMapSize ?? 2048; sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 160 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .035; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xbcd4ff, .35); fill.position.set(-30, 25, -20); scene.add(fill);

  const SKY = [ // hour, top, bottom
    [0, 0x0d1a36, 0x23395f], [5.0, 0x14244a, 0x3a4b78], [6.2, 0x6a86c0, 0xffb98a], [7.5, 0x83c3ec, 0xffe6c2], [12, 0x72bdea, 0xd8f0fb],
    [17, 0x7fbbe5, 0xffe3b8], [19.3, 0x5a69a8, 0xff9e70], [20.6, 0x1f2f5c, 0x4a4f86], [24, 0x0d1a36, 0x23395f]];
  const cTop = new THREE.Color(), cBot = new THREE.Color(), cA = new THREE.Color(), cB = new THREE.Color();
  function skyAt(h) { for (let i = 0; i < SKY.length - 1; i++) { const [h0, t0c, b0] = SKY[i], [h1, t1c, b1] = SKY[i + 1]; if (h >= h0 && h <= h1) { const u = (h - h0) / (h1 - h0); cTop.set(t0c).lerp(cA.set(t1c), u); cBot.set(b0).lerp(cB.set(b1), u); return; } } }
  let lastSky = '';
  const sunCol = new THREE.Color(), tmpC = new THREE.Color();
  const state = { night: 0, daylight: 1, t: 0 };

  function update(dt, t, minutes) {
    const h = minutes / 60;
    const daylight = smooth(5.6, 7.4, h) * (1 - smooth(18.9, 20.6, h));
    const night = 1 - smooth(5.4, 6.8, h) + smooth(19.2, 20.4, h);
    state.night = Math.min(1, night); state.daylight = daylight; state.t = t;
    // sun arc: east (morning) → south → west (evening); moon otherwise
    const s = Math.min(1, Math.max(0, (h - 5.8) / (20.2 - 5.8))), elev = Math.sin(s * PI);
    if (daylight > .02) { sun.position.set(Math.cos(s * PI) * 42, 8 + elev * 42, 24); sunCol.set(0xffa66e).lerp(tmpC.set(0xfff2dc), Math.min(1, elev * 1.6)); }
    else { sun.position.set(-22, 40, 18); sunCol.set(0x8fa6ff); }
    sun.color.copy(sunCol); sun.intensity = .32 + daylight * 2.35;
    hemi.intensity = .72 + daylight * .55; hemi.color.set(0x2c3f72).lerp(tmpC.set(0xdff0ff), daylight); hemi.groundColor.set(0x1d2b2a).lerp(tmpC.set(0x7a9a63), daylight);
    fill.intensity = .15 + daylight * .25;
    for (const g of glowMats) g.emissiveIntensity = state.night * 1.35; poolMat.opacity = state.night * .85;
    skyAt(h); const css = `linear-gradient(to bottom, #${cTop.getHexString()} 0%, #${cBot.getHexString()} 100%)`;
    if (css !== lastSky && opts.skyEl) { opts.skyEl.style.background = css; lastSky = css; }
    // ambient motion (real time)
    sway.value = t;
    for (const w of waters) w.material.emissiveIntensity = .22 + Math.sin(t * 2.2) * .05;
    for (let i = 0; i < 20; i++) {
      const p = (t * .75 + i / 20) % 1, a = i / 20 * PI * 2 + i * .7, r = .25 + p * 1.0;
      dummy.position.set(fountainAt.x + Math.cos(a) * r, 1.75 + 1.1 * p - 2.3 * p * p + .05, fountainAt.z + Math.sin(a) * r); dummy.scale.setScalar(.055 * (1 - p * .4)); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 7; i++) {
      const p = (t * .16 + i / 7) % 1, [cx, cy, cz] = bakeryChimney;
      dummy.position.set(cx + p * 1.4 + Math.sin(t * .6 + i) * .15 * p, cy + p * 3.4, cz - p * .5); dummy.rotation.set(i, t * .2 + i, 0);
      dummy.scale.setScalar((.22 + p * .6) * Math.min(1, (1 - p) * 3)); dummy.updateMatrix(); smoke.setMatrixAt(i, dummy.matrix);
    }
    smoke.instanceMatrix.needsUpdate = true; smoke.visible = smokeOn;
    animatePlots(t);
    const showB = daylight > .3;
    wingsR.visible = wingsL.visible = showB;
    if (showB) bfly.forEach((b, i) => {
      const tt = t * b.sp + b.ph, x = b.x + Math.sin(tt) * b.r, z = b.z + Math.sin(tt * 1.7) * b.r * .6, y = .9 + Math.sin(tt * 2.3) * .35;
      const dx = Math.cos(tt) * b.r, dz = Math.cos(tt * 1.7) * 1.7 * b.r * .6, yaw = Math.atan2(-dz, dx), flap = Math.sin(t * 22 + i) * .95;
      dummy.position.set(x, y, z); dummy.scale.setScalar(1);
      dummy.rotation.set(flap, yaw, 0, 'YXZ'); dummy.updateMatrix(); wingsR.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(PI - flap, yaw, 0, 'YXZ'); dummy.updateMatrix(); wingsL.setMatrixAt(i, dummy.matrix);
    });
    wingsR.instanceMatrix.needsUpdate = wingsL.instanceMatrix.needsUpdate = true;
    flies.visible = state.night > .05; flies.material.opacity = state.night;
    if (flies.visible) fly.forEach((f, i) => { const tt = t * .5 + f.ph; dummy.position.set(f.x + Math.sin(tt) * .8, .7 + Math.sin(tt * 1.9) * .4, f.z + Math.cos(tt * .8) * .8); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.05 + .04 * Math.max(0, Math.sin(t * 3 + f.ph * 3))); dummy.updateMatrix(); flies.setMatrixAt(i, dummy.matrix); });
    flies.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 3; i++) { const a = t * (.08 + i * .02) + i * 2.1, rx = 2.3 - i * .5, rz = 1.5 - i * .3; dummy.position.set(pondAt.x + Math.cos(a) * rx, .07 + Math.sin(t * 2 + i) * .02, pondAt.z + Math.sin(a) * rz); dummy.rotation.set(0, Math.atan2(-Math.cos(a) * rz, -Math.sin(a) * rx), 0); dummy.scale.setScalar(1); dummy.updateMatrix(); ducks.setMatrixAt(i, dummy.matrix); }
    ducks.instanceMatrix.needsUpdate = true;
    cloudSet.forEach((c, i) => { const a = c.a + t * .006; dummy.position.set(Math.cos(a) * c.r, c.y, Math.sin(a) * c.r); dummy.rotation.set(0, a, 0); dummy.scale.setScalar(c.s); dummy.updateMatrix(); clouds.setMatrixAt(i, dummy.matrix); });
    clouds.instanceMatrix.needsUpdate = true;
    const fp = flagGeo.attributes.position; for (let i = 0; i < fp.count; i++) { const x0 = flagBase[i * 3]; fp.setZ(i, Math.sin(x0 * 5 - t * 5) * .1 * x0); }
    fp.needsUpdate = true; flagGeo.computeVertexNormals();
    hourHand.rotation.z = -((minutes / 60) % 12) / 12 * PI * 2; minHand.rotation.z = -(minutes % 60) / 60 * PI * 2;
  }

  /* ================= LIVING PLOTS: new buildings, demolition and construction ================= */
  // Where a new structure stands on each redevelopable plot (front faces +z locally; ry turns it to the street).
  const PLOT_ANCHOR = {
    P005: { x: -20, z: 0, ry: 0, w: 7.2, d: 5.6, site: 4 }, P007: { x: 7, z: 0, ry: 0, w: 6.8, d: 5.4, site: 6 }, P008: { x: 21, z: 0, ry: 0, w: 7.0, d: 5.6, site: 7 },
    P010: { x: -6.5, z: 16.5, ry: PI, w: 7.0, d: 5.6, site: 9 }, P011: { x: 22.5, z: 16.5, ry: PI, w: 7.0, d: 5.6, site: 10 },
  };
  let smokeOn = true;
  const plotDyn = {}, plotKeys = {}, plotAnims = {};
  const ORANGE = 0xff7a1a, CONCRETE = 0xb9b4aa, LUMBER = 0xd8b07a, STEEL = 0x8c969c, SOIL = 0x9b7653, YELLOW = 0xf2b632;
  const awning = (w, d, y, cols, depth = 1.3, tilt = .42) => { const n = Math.max(6, Math.round(w / .55)); for (let i = 0; i < n; i++) { const x = -w / 2 + w / n * (i + .5), col = cols[i % cols.length]; W.add(Geo.box, col, at(x, y, d / 2 + depth / 2 - .05, 0, w / n + .01, .06, depth, tilt), 0); W.add(Geo.halfDisc, col, at(x, y - Math.sin(tilt) * depth / 2 - .02, d / 2 + depth - .1, 0, w / n / 2, -.18, .04), 0); } };
  const wallLamp = (x, y, z) => { GL.add(Geo.box, 0xffe2a8, at(x, y, z + .2, 0, .18, .28, .18), 0); box(W, P.iron, x, y + .19, z + .2, .24, .06, .24, 0, 0); };

  // ---------- one recognisable building per business category ----------
  const GEN = {
    bakery(n) {
      const w = 6.8, d = 5.4, h = 3.9, c = pick([0xf3dcb4, 0xf6e3c5, 0xefd2a8]), red = pick([0x8c3b2c, 0x6e4a35]);
      shell(w, d, h, c, { trim: 0xfff1d6 }); hip(w, d, h, 1.9, .45, pick([0xb85c48, 0xc36d56])); chimney(-2.2, -1.3, h, h + 2.2);
      for (const sx of [-2.1, 2.1]) { win(sx, 1.7, d / 2, 1.8, 1.5, { frame: red, mull: false }); for (let k = 0; k < 5; k++) W.add(Geo.ico1, pick([0xc98a4b, 0xd9a05b, 0xb8743c]), at(sx - .7 + k * .35, 1.05, d / 2 + .14, R(0, 1), .15, .1, .12), .05); }
      door(0, d / 2, 1.15, 2.2, red, { glassTop: true, frame: red });
      awning(w + .3, d, 2.85, [0xd9493c, 0xfff4e0]); dynSign(n, 'bakery', 0, 3.45, d / 2 + .02, 3.4);
      for (const sx of [-1.3, 1.3]) pot(sx, d / 2 + .55, .22, P.warm); tableSet(-2.6, d / 2 + 2.0, 2, 0xd9493c);
      return { h: h + 2.2, chimney: true };
    },
    cafe(n) {
      const w = 7.0, d = 5.4, h = 4.2, c = pick([0x7d5a46, 0x8f6b52, 0x6f8f7a]), trim = 0xf3e7d3;
      shell(w, d, h, c, { trim }); boxB(W, dark(c, .85), 0, h, 0, w + .3, .45, d + .3, 0, .02); boxB(W, 0x7d746a, 0, h, 0, w - .3, .47, d - .3, 0, .02);
      for (const sx of [-2.15, 2.15]) win(sx, 1.55, d / 2, 1.9, 1.45, { frame: trim });
      door(0, d / 2, 1.15, 2.1, 0x2f4a3a, { glassTop: true, frame: trim }); awning(w + .2, d, 2.75, [0x2f6b4a, 0xf3e7d3]);
      dynSign(n, 'cafe', 0, 3.5, d / 2 + .02, 3.2); wallLamp(-.95, 2.15, d / 2); wallLamp(.95, 2.15, d / 2);
      cyl(W, P.white, 1.8, h + .45, -.8, .6, .07, 16, 0); cyl(W, P.white, 1.8, h + .52, -.8, .42, .7, 12, 0); cyl(W, 0x4a2c1d, 1.8, h + 1.22, -.8, .37, .04, 12, 0);
      tableSet(-2.5, d / 2 + 2.0, 2, 0xfff4e0); tableSet(2.5, d / 2 + 2.0, 2, 0x2f6b4a);
      return { h: h + 1.3 };
    },
    florist(n) {
      const w = 6.4, d = 5.2, h = 3.8, c = pick([0xf2e6ef, 0xe8f0e0, 0xf6efe0]), green = pick([0x4f7a5a, 0x5d8a64]);
      shell(w, d, h, c, {}); roof({ kind: 'mansard', w, d, h0: h, rh: 1.9, oh: .4, ohe: .25, roof: green, wall: c });
      for (const sx of [-1.95, 1.95]) win(sx, 1.7, d / 2, 1.3, 1.3, { arch: true, flowers: P.flowers, boxColor: green });
      door(0, d / 2, 1.1, 2.1, green, { arch: true, glassTop: true }); dynSign(n, 'florist', 0, 3.45, d / 2 + .02, 3.2);
      for (const sx of [-2.6, 2.6]) { for (let t = 0; t < 3; t++) boxB(W, P.woodL, sx, 0, d / 2 + .95 + t * .42, 1.2, .66 - t * .2, .42, 0, .04); for (let k = 0; k < 6; k++) fol(Geo.octa, pick(P.flowers), sx + R(-.5, .5), R(.7, .95), d / 2 + 1.2 + R(-.4, .4), .1, .09, .1, .4, .5); }
      roundTree(3.6, -3.4, .8, [0xf2a7c3, 0xf7bfd3]);
      return { h: h + 1.9 };
    },
    repair(n) {
      const w = 7.4, d = 5.8, h = 3.8, c = pick([0x8a949b, 0x9aa5a0, 0x7f8b94]), metal = pick([0x55606b, 0x6b4f3f]);
      boxB(W, c, 0, 0, 0, w, h, d, 0, .02); boxB(W, P.stone, 0, 0, 0, w + .2, .3, d + .2, 0, .02);
      for (let x = -w / 2 + .3; x < w / 2; x += .45) box(W, dark(c, .9), x, h / 2, d / 2 + .02, .05, h - .3, .03, 0, 0); // corrugated ribs
      roof({ w, d, h0: h, rh: 1.4, oh: .35, ohe: .2, roof: metal, wall: c });
      boxB(W, 0x3a3f45, -1.2, .05, d / 2 + .04, 3.4, 2.9, .1, 0, 0); for (let k = 0; k < 9; k++) box(W, 0x55606b, -1.2, .3 + k * .32, d / 2 + .1, 3.3, .06, .03, 0, 0); // roll-up door
      for (let k = 0; k < 5; k++) box(W, k % 2 ? 0x222222 : YELLOW, -1.2 - 1.6 + k * .8, 3.08, d / 2 + .1, .8, .14, .05, 0, 0);
      door(2.4, d / 2, .95, 2.05, 0x3f6fae, { glassTop: true }); win(2.4, 3.0, d / 2, .9, .5, { mull: false });
      dynSign(n, 'repair', 0, h + .35, d / 2 + .25, 3.6);
      for (let k = 0; k < 4; k++) W.add(Geo.torus, 0x222222, at(-3.6, .14 + k * .2, d / 2 + 1.0, 0, .32, .32, .32, PI / 2), .03); // tyre stack
      barrel(3.4, d / 2 + .9, 0x3f6fae); barrel(3.4, d / 2 + 1.7, 0xd9493c); crate(-3.3, -2.2);
      return { h: h + 1.5 };
    },
    bookstore(n) {
      const w = 6.4, d = 5.4, h = 5.0, c = pick([0x7b5a8a, 0x5f7d95, 0x8a5a4a]), trim = 0xf6e7c8;
      shell(w, d, h, c, { trim }); box(W, trim, 0, 2.5, 0, w + .1, .14, d + .1, 0, .02);
      roof({ kind: 'gambrel', w, d, h0: h, rh: 2.4, oh: .4, ohe: .3, roof: 0x3b2f5c, wall: c, along: 'z' });
      boxB(W, c, -1.4, .4, d / 2 + .4, 2.4, 1.9, .8, 0, .02); win(-1.4, 1.4, d / 2 + .82, 1.9, 1.1, { frame: trim });
      for (let k = 0; k < 8; k++) boxB(W, pick([0xd9493c, 0x3f6fae, 0xf2c14e, 0x5fa04f, 0xffffff]), -2.2 + k * .23, .92, d / 2 + .7, .18, R(.3, .45), .25, 0, .03);
      hip(2.4, .8, 2.3, .5, .12, 0x3b2f5c, -1.4, d / 2 + .4);
      door(1.7, d / 2, 1.0, 2.1, 0x3b2f5c, { glassTop: true, frame: trim });
      for (const sx of [-1.7, 1.7]) win(sx, 3.6, d / 2, .9, 1.0, { frame: trim, shutter: dark(c, .7) });
      dynSign(n, 'bookstore', .2, 2.95, d / 2 + .02, 3.2); bench(2.5, d / 2 + 1.9, 0);
      return { h: h + 2.4 };
    },
    general(n) {
      const w = 7.6, d = 5.6, h = 4.0, c = pick([0xe9d9b8, 0xd8e2e8, 0xe8d0c0]), blue = pick([0x2f5f8a, 0x8a3b3b]);
      shell(w, d, h, c, {}); boxB(W, dark(c, .9), 0, h, 0, w + .3, .55, d + .3, 0, .02);
      for (const sx of [-2.6, 2.6]) win(sx, 1.6, d / 2, 1.8, 1.4, { frame: blue });
      door(0, d / 2, 1.5, 2.2, blue, { glassTop: true }); awning(w + .4, d, 2.7, [blue, 0xffffff], 1.6, .32);
      dynSign(n, 'general', 0, 3.5, d / 2 + .02, 4.0);
      for (const sx of [-2.8, -1.6, 1.6, 2.8]) { boxB(W, 0xc39a68, sx, 0, d / 2 + 1.2, .9, .5, .6, 0, .05); for (let k = 0; k < 6; k++) W.add(Geo.ico0, pick([0xd9493c, 0xf2a93b, 0x5fa04f, 0xffd166]), at(sx + R(-.32, .32), .58, d / 2 + 1.2 + R(-.2, .2), 0, .1, .1, .1), .05); }
      return { h: h + .6 };
    },
    restaurant(n) {
      const w = 7.2, d = 5.8, h = 5.2, c = pick([0x9a4a3f, 0xb5654a, 0x7d5a46]), trim = 0xf3e7d3;
      shell(w, d, h, c, { trim }); box(W, trim, 0, 2.7, 0, w + .1, .16, d + .1, 0, .02);
      roof({ w, d, h0: h, rh: 2.2, oh: .45, ohe: .3, roof: 0x3d3a3a, wall: c }); chimney(2.4, -1.4, h, h + 2.6, 0x8f8a80);
      for (const sx of [-2.3, 2.3]) { win(sx, 1.5, d / 2, 1.6, 1.4, { frame: trim, arch: true }); win(sx, 3.9, d / 2, 1.0, 1.0, { frame: trim, flowers: P.warm }); }
      door(0, d / 2, 1.3, 2.3, 0x3a2a20, { glassTop: true, transom: true, frame: trim });
      dynSign(n, 'restaurant', 0, 3.25, d / 2 + .02, 3.0); wallLamp(-1.2, 2.3, d / 2); wallLamp(1.2, 2.3, d / 2);
      for (let i = 0; i <= 10; i++) { const x = -w / 2 + w * i / 10; GL.add(Geo.octa, 0xffe6a8, at(x, 2.55 - Math.sin(i / 10 * PI) * .3, d / 2 + .9, 0, .09, .12, .09), 0); }
      tableSet(-2.3, d / 2 + 2.1, 2, 0x5a1f24); tableSet(2.3, d / 2 + 2.1, 2, 0xfff4e0);
      return { h: h + 2.6 };
    },
    gallery(n) {
      const w = 7.0, d = 5.4, h = 4.4;
      boxB(W, 0xf7f5ef, 0, 0, 0, w, h, d, 0, .01); boxB(W, 0xdcd8cf, 0, h, 0, w + .2, .25, d + .2, 0, .01); boxB(W, 0xb0aca4, 0, 0, 0, w + .2, .25, d + .2, 0, .01);
      GL.add(Geo.box, P.glass, at(-.8, 1.9, d / 2 + .02, 0, 4.4, 2.9, .06), .02); box(W, 0x333333, -.8, 3.4, d / 2 + .05, 4.6, .1, .1, 0, 0); box(W, 0x333333, -.8, .45, d / 2 + .05, 4.6, .1, .1, 0, 0);
      boxB(W, pick([0xe8493c, 0x3f6fae, 0xf2c14e]), 2.6, 0, d / 2 + .05, 1.0, h, .08, 0, 0);
      door(2.6, d / 2 + .1, .95, 2.1, 0x333333, { glassTop: true, frame: 0x333333 });
      for (let k = 0; k < 3; k++) boxB(W, pick([0xe8493c, 0x3f6fae, 0xf2c14e, 0x5fa04f]), -2.4 + k * 1.6, .9, d / 2 - .2, .9, 1.1, .05, 0, 0); // paintings inside
      dynSign(n, 'gallery', -.8, h - .35, d / 2 + .04, 3.0);
      boxB(W, 0xd6cfbf, -2.4, 0, d / 2 + 1.8, .8, .5, .8, 0, 0); W.add(Geo.torus, 0xe8493c, at(-2.4, 1.15, d / 2 + 1.8, .4, .38, .38, .38), 0); W.add(Geo.ico0, 0x3f6fae, at(-2.4, .75, d / 2 + 1.8, 0, .25, .25, .25), 0);
      return { h: h + .3 };
    },
    house(n) {
      const w = 6.0, d = 5.0, h = 3.4, c = pick([0xbad2ab, 0xe8bbc5, 0xb0cbe3, 0xf3dcb4]);
      shell(w, d, h, c, {}); roof({ w, d, h0: h, rh: 2.3, oh: .5, ohe: .3, roof: pick([0x5f7d95, 0xa44a3f, 0x55606b]), wall: c }); chimney(1.8, -1.0, h, h + 2.3);
      door(0, d / 2, 1.0, 2.0, 0x5a3e2b, { glassTop: true }); for (const sx of [-1.8, 1.8]) win(sx, 1.6, d / 2, .95, 1.05, { shutter: 0x3f5f7a, flowers: P.warm });
      picket(-3.6, d / 2 + 2.4, -.7, d / 2 + 2.4); picket(.7, d / 2 + 2.4, 3.6, d / 2 + 2.4);
      return { h: h + 2.3 };
    },
  };

  // ---------- construction-site kit ----------
  function fenceAround(w, d, gap = true) {
    const hw = w / 2 + .7, hd = d / 2 + .8, panel = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.round(L / 1.5));
      for (let i = 0; i <= n; i++) cyl(W, 0x555555, x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, .05, 1.15, 6, 0);
      for (let i = 0; i < n; i++) { const u = (i + .5) / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u; box(W, i % 2 ? ORANGE : 0xffffff, x, .82, z, L / n - .04, .22, .05, ry, 0); box(W, i % 2 ? 0xffffff : ORANGE, x, .42, z, L / n - .04, .22, .05, ry, 0); }
    };
    panel(-hw, -hd, hw, -hd); panel(-hw, -hd, -hw, hd); panel(hw, -hd, hw, hd);
    if (gap) { panel(-hw, hd, -1.3, hd); panel(1.3, hd, hw, hd); } else panel(-hw, hd, hw, hd);
    warnSign(-hw + .9, hd + .05); warnSign(hw - .9, hd + .05);
  }
  function warnSign(x, z) { cyl(W, 0x555555, x, 0, z, .04, 1.25, 6, 0); box(W, 0xffd23f, x, 1.45, z + .04, .5, .5, .04, 0, 0, 0, PI / 4); box(W, 0x2b2b2b, x, 1.47, z + .07, .06, .2, .02, 0, 0); box(W, 0x2b2b2b, x, 1.32, z + .07, .06, .06, .02, 0, 0); }
  function projectBoard(x, z, title, sub, style = 'board') { for (const sx of [-.85, .85]) cyl(W, P.woodD, x + sx, 0, z, .06, 1.9, 6, 0); dynSign(title, style, x, 1.75, z + .03, 2.1, 0, sub); }
  function excavator(x, z, ry, anim) {
    withT(x, 0, z, ry, () => {
      for (const s of [-1, 1]) { boxB(W, 0x2b2b2b, s * .62, 0, 0, .42, .45, 2.3, 0, 0); for (let k = 0; k < 4; k++) cyl(W, 0x555555, s * .62, .06, -.8 + k * .53, .17, .02, 8, 0, .17); }
      boxB(W, YELLOW, 0, .45, -.2, 1.7, .7, 1.9, 0, .02); boxB(W, YELLOW, -.35, 1.15, .1, .9, .9, 1.0, 0, .02);
      GL.add(Geo.box, P.glass, at(-.35, 1.65, .62, 0, .78, .5, .05), 0); boxB(W, 0x3a3a3a, .45, 1.15, -.8, .7, .25, .5, 0, 0);
      const drawArm = () => { box(W, YELLOW, 0, .55, .95, .22, .22, 2.3, 0, 0, -.55); box(W, YELLOW, 0, 1.15, 2.15, .18, .18, 1.6, 0, 0, .9); box(W, 0x555555, 0, .45, 2.75, .6, .4, .45, 0, 0, .3); };
      if (anim) {
        const g = new THREE.Group(); placeOnBase(g, .4, 1.3, .4, 0);
        const saved = W, sb = base.clone(); W = new Batch(); base.identity(); drawArm(); const arm = W; W = saved; base.copy(sb);
        anim.push({ kind: 'arm', g, batch: arm });
      } else withT(.4, 1.3, .4, 0, drawArm);
    });
  }
  function dumpster(x, z, fill = 0, ry = 0) {
    withT(x, 0, z, ry, () => {
      boxB(W, 0x2f6b4a, 0, .1, 0, 2.0, .9, 1.1, 0, .02); boxB(W, 0x24543a, 0, 0, 0, 1.8, .12, .9, 0, 0); box(W, 0x24543a, 0, .98, 0, 2.06, .06, 1.16, 0, 0);
      if (fill > 0) for (let i = 0; i < Math.round(fill * 9); i++) W.add(Geo.dode, pick([0x9a958c, 0xb5654a, 0x8f6b52, LUMBER]), at(R(-.75, .75), .85 + R(0, .25) * fill, R(-.35, .35), R(0, 6), R(.15, .3), R(.1, .2), R(.15, .3)), .05);
    });
  }
  function rubble(w, d, amount, cols) {
    const n = Math.round(amount * 26);
    for (let i = 0; i < n; i++) { const x = R(-w / 2, w / 2), z = R(-d / 2, d / 2), s = R(.25, .65) * (.5 + amount * .7); W.add(Geo.dode, pick(cols), at(x, s * .25, z, R(0, 6), s * R(.9, 1.4), s * R(.5, .8), s * R(.8, 1.3), R(-.3, .3), R(-.3, .3)), .06); }
    for (let i = 0; i < Math.round(amount * 6); i++) box(W, pick([LUMBER, 0x8f6b52]), R(-w / 2, w / 2), .12, R(-d / 2, d / 2), R(.8, 1.8), .1, .14, R(0, PI), .05, 0, R(-.3, .3));
  }
  function dirtLot(w, d) { boxB(W, SOIL, 0, 0, 0, w + 1.2, .05, d + 1.4, 0, .04); for (let i = 0; i < 10; i++) W.add(Geo.dode, pick([0x8a6a4a, 0x7a5d43, P.rock]), at(R(-w / 2, w / 2), .05, R(-d / 2, d / 2), R(0, 6), .16, .08, .14), .05); }
  function scaffold(w, d, h) {
    const hw = w / 2 + .45, hd = d / 2 + .45, lv = Math.max(1, Math.floor(h / 1.3));
    for (const [x0, z0, x1, z1] of [[-hw, hd, hw, hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd]]) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.6)), ry = Math.atan2(-(z1 - z0), x1 - x0);
      for (let i = 0; i <= n; i++) cyl(W, STEEL, x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, .04, h + .4, 6, 0);
      for (let k = 1; k <= lv; k++) { const y = k * h / lv; box(W, STEEL, (x0 + x1) / 2, y, (z0 + z1) / 2, L, .05, .05, ry, 0); box(W, LUMBER, (x0 + x1) / 2, y + .05, (z0 + z1) / 2 + (z0 === z1 ? (z0 > 0 ? -.18 : .18) : 0), L, .05, .32, ry, .04); }
    }
  }
  function slab(w, d, t) { boxB(W, CONCRETE, 0, 0, 0, w + .2, .05 + .3 * t, d + .2, 0, .02); if (t < .95) for (let x = -w / 2; x <= w / 2; x += .6) box(W, 0x6b4f3f, x, .4 * t + .05, 0, .03, .03, d, 0, 0); }
  function framing(w, d, h, t) {
    const ph = h * clamp01(t * 1.25);
    for (let x = -w / 2; x <= w / 2 + .01; x += w / 5) for (const z of [-d / 2, d / 2]) boxB(W, LUMBER, x, .35, z, .16, ph, .16, 0, .04);
    for (let z = -d / 2 + d / 4; z < d / 2 - .01; z += d / 4) for (const x of [-w / 2, w / 2]) boxB(W, LUMBER, x, .35, z, .16, ph, .16, 0, .04);
    if (t > .55) for (const y of [1.6, h]) if (y <= ph + .36) { box(W, LUMBER, 0, y + .35, -d / 2, w, .14, .14, 0, .03); box(W, LUMBER, 0, y + .35, d / 2, w, .14, .14, 0, .03); box(W, LUMBER, -w / 2, y + .35, 0, .14, .14, d, 0, .03); box(W, LUMBER, w / 2, y + .35, 0, .14, .14, d, 0, .03); }
    if (t > .85) for (let x = -w / 2; x <= w / 2 + .01; x += w / 4) W.add(ex([[-d / 2 - .2, 0], [d / 2 + .2, 0], [0, 1.6]]), LUMBER, at(x, h + .35, 0, PI / 2, 1, 1, .12), .04);
  }
  function ribbon(d) { for (const sx of [-1.3, 1.3]) cyl(W, 0xc9a24a, sx, 0, d / 2 + 1.4, .05, 1.1, 6, 0); box(W, 0xd9283c, 0, .95, d / 2 + 1.4, 2.6, .12, .03, 0, 0); W.add(Geo.ico0, 0xd9283c, at(0, .95, d / 2 + 1.42, 0, .14, .1, .05), 0); }
  function balloons(x, z, anim) { const g = new THREE.Group(); placeOnBase(g, x, 0, z, 0); const saved = W, sb = base.clone(); W = new Batch(); base.identity(); for (let k = 0; k < 5; k++) { const a = k * 1.3, bx = Math.cos(a) * .3, bz = Math.sin(a) * .25, by = 2.4 + (k % 3) * .3; W.add(Geo.ico1, pick([0xff5f87, 0xffd166, 0x6fa8ff, 0x9fd38a, 0xffffff]), at(bx, by, bz, 0, .28, .34, .28), 0); box(W, 0xdddddd, bx * .5, by / 2, bz * .5, .01, by, .01, 0, 0); } const b = W; W = saved; base.copy(sb); anim.push({ kind: 'balloon', g, batch: b, y0: 0 }); }
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const WORKER_SPOTS = (w, d) => [[-w / 2 - .2, d / 2 + .9, PI], [w / 2 - .6, d / 2 + .7, PI + .3], [-1.2, d / 2 + 1.6, -.5]];

  // Build the dynamic content of one plot for a visual state from the simulation.
  function buildPlot(pid, v) {
    const A = PLOT_ANCHOR[pid], orig = plotOrig[pid];
    const group = new THREE.Group(); group.name = 'plot:' + pid + ':dynamic';
    const anim = []; let clipOrig = 1e4, clipNew = 1e4, showOrig = false;
    const saved = { W, F, GL, rnd }; W = new Batch(); F = new Batch(); GL = new Batch(); dyn = true; addTarget = group;
    rnd = mulberry32([...(pid + (v.name || '') + (v.kind || ''))].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7));
    const w = A.w, d = A.d, ph = v.phase, prog = v.progress ?? 1, newKind = v.kind && GEN[v.kind] ? v.kind : null;
    const building = (kind, name) => GEN[kind](name || '');
    withT(A.x, 0, A.z, A.ry, () => {
      if (v.mode === 'original') showOrig = true;
      else if (v.mode === 'structure' && newKind) building(newKind, v.name);
      else if (v.mode === 'vacant') { dirtLot(w, d); }
      else if (v.mode === 'demolition') {
        const order = ['approved', 'fenced', 'equipment', 'dismantle', 'demolished', 'rubble', 'clearing', 'cleared'], k = Math.max(0, order.indexOf(ph));
        const standing = v.building && !v.building.original ? v.building.kind : null;
        if (k <= 3) { if (v.original) showOrig = true; else if (standing && GEN[standing]) { const r = building(standing, ''); if (k === 3) clipNew = Math.max(1.0, r.h * (1 - .7 * prog)); } }
        if (k === 3 && v.original) clipOrig = Math.max(1.0, 7.8 * (1 - .75 * prog));
        if (k >= 1 && k < 7) fenceAround(w, d, true);
        if (k >= 2 && k < 7) { excavator(-w / 2 + 1.0, d / 2 + .3, .5, v.crew && !v.paused ? anim : null); dumpster(w / 2 + .2, -d / 2 + .4, k >= 6 ? .9 : k >= 4 ? .5 : 0, PI / 2); }
        if (k === 3) rubble(w * .9, d * .7, .25 + .3 * prog, [0x9a958c, 0xb5654a, 0xcfc6b2]);
        if (k === 4 || k === 5) { rubble(w, d, k === 4 ? .9 : 1.0, [0x9a958c, 0xb5654a, 0xcfc6b2, 0x8f6b52]); if (k === 4) for (const [x, z, ww] of [[-w / 2 + .3, 0, .3], [w / 2 - .3, -.6, .3], [-.8, -d / 2 + .2, 2.2]]) boxB(W, 0xd9cbb0, x, 0, z, ww === .3 ? .3 : ww, R(.6, 1.4), ww === .3 ? 2.2 : .3, 0, .05); }
        if (k === 6) { rubble(w, d, Math.max(.05, 1 - prog), [0x9a958c, 0xb5654a, 0xcfc6b2]); dirtLot(w, d); }
        if (k >= 7) dirtLot(w, d);
        if (k === 0) projectBoard(-w / 2 - .2, d / 2 + 1.6, 'Demolition approved', v.name ? 'Demolition of ' + v.name : 'Demolition', 'warn');
        else if (k < 7) projectBoard(w / 2 - .4, d / 2 + 1.6, v.paused ? 'Work paused' : 'Demolition in progress', v.name || '', 'warn');
      } else if (v.mode === 'construction' || v.mode === 'renovation') {
        const order = v.mode === 'renovation' ? ['planning', 'permits', 'interior', 'inspection', 'opening'] : ['planning', 'permits', 'siteprep', 'foundation', 'framing', 'roof', 'windows', 'interior', 'landscaping', 'inspection', 'completion', 'opening'];
        const k = Math.max(0, order.indexOf(ph));
        const title = v.paused ? 'Work paused' : ph === 'opening' ? 'Grand opening!' : ph === 'permits' ? 'Permit pending' : 'Coming soon';
        if (v.mode === 'renovation') {
          if (v.original) showOrig = true; else if (v.building && GEN[v.building.kind]) building(v.building.kind, ''); else if (newKind) building(newKind, '');
          if (k >= 2 && k < 4) { scaffold(w, d, 3.6); dumpster(w / 2 + .3, d / 2 + 1.2, .4 + .4 * prog, 0); }
          if (k < 4) projectBoard(-w / 2 - .3, d / 2 + 1.7, title, 'Renovation · ' + (v.name || ''));
          if (k >= 4) { ribbon(d); balloons(-1.8, d / 2 + 1.6, anim); balloons(1.8, d / 2 + 1.6, anim); }
        } else {
          if (k <= 1) { dirtLot(w, d); for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) { cyl(W, LUMBER, x, 0, z, .04, .6, 6, 0); box(W, ORANGE, x, .58, z, .12, .04, .02, 0, 0); } }
          if (k === 2) { dirtLot(w, d); fenceAround(w, d); excavator(-w / 2 + 1.2, d / 2 - .2, .4, v.crew && !v.paused ? anim : null); for (let i = 0; i < 4; i++) W.add(Geo.dode, SOIL, at(R(-w / 3, w / 3), .2, R(-d / 3, d / 4), R(0, 6), R(.6, 1.1), R(.35, .6), R(.6, 1.0)), .05); }
          if (k === 3) { dirtLot(w, d); fenceAround(w, d); slab(w, d, prog); dumpster(w / 2 + .3, -d / 2 + .4, .2, PI / 2); }
          if (k === 4) { fenceAround(w, d); slab(w, d, 1); framing(w, d, 3.6, prog); }
          if (k >= 5 && newKind) { const r = building(newKind, k >= 10 ? v.name : ''); if (k === 5) clipNew = .6 + (r.h - .6) * clamp01(.25 + .75 * prog); }
          if (k >= 5 && k <= 6) { scaffold(w, d, k === 5 ? 3.0 + 1.6 * prog : 4.4); fenceAround(w, d); }
          if (k === 7) { fenceAround(w, d); dumpster(w / 2 + .4, d / 2 + 1.1, .6, 0); }
          if (k === 8) for (let i = 0; i < Math.round(8 * prog) + 2; i++) shrub(R(-w / 2, w / 2), d / 2 + R(1.0, 2.2), R(.3, .45));
          if (k === 9) for (const sx of [-1.6, 1.6]) { cone(W, ORANGE, sx, 0, d / 2 + 1.5, .2, .55, 8, 0); box(W, 0xffffff, sx, .3, d / 2 + 1.5, .26, .06, .26, 0, 0); }
          if (k < 10) projectBoard(-w / 2 - .4, d / 2 + 1.8, title, (v.name || 'New building') + (v.paused ? '' : ' · ' + (PHASE_LABEL[ph] || '')));
          if (k >= 11) { ribbon(d); balloons(-1.9, d / 2 + 1.7, anim); balloons(1.9, d / 2 + 1.7, anim); }
          else if (k === 10) projectBoard(-w / 2 - .4, d / 2 + 1.8, 'Opening soon', v.name || '');
        }
      }
      if (v.forSale && !v.paused) { cyl(W, P.white, w / 2 + .6, 0, d / 2 + 2.0, .05, 1.5, 6, 0); box(W, P.white, w / 2 + .9, 1.45, d / 2 + 2.0, .7, .05, .05, 0, 0); dynSign('For sale', 'sale', w / 2 + 1.1, 1.0, d / 2 + 2.0, 1.2); }
      if (v.closed && (v.mode === 'original' || v.mode === 'structure')) { for (const s of [-1, 1]) box(W, 0xb07a52, 0, 1.4, d / 2 + .12, 1.5, .14, .04, 0, 0, s * .6); dynSign('Closed', 'warn', 0, 2.5, d / 2 + .1, 1.3); }
    });
    const mats = matsFor(pid + ':n');
    meshesInto(group, { W, F, GL }, mats, 'plot:' + pid + ':structure');
    for (const a of anim) { a.mesh = new THREE.Mesh(a.batch.geometry(), mats.world); a.mesh.castShadow = true; a.g.add(a.mesh); group.add(a.g); }
    ({ W, F, GL, rnd } = saved); dyn = false; addTarget = null;
    mats.plane.constant = clipNew; if (orig) { matsFor(pid + ':o').plane.constant = clipOrig; orig.group.visible = showOrig; }
    return { group, anim };
  }
  const PHASE_LABEL = Object.fromEntries([['siteprep', 'site preparation'], ['foundation', 'foundation'], ['framing', 'framing'], ['roof', 'roof & exterior'], ['windows', 'windows & doors'], ['interior', 'interior'], ['landscaping', 'landscaping'], ['inspection', 'inspection'], ['planning', 'planning'], ['permits', 'permits']]);
  function disposeGroup(g) { g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.userData.dispose || o.parent?.userData?.dispose) o.material.dispose?.(); if (o.material?.map && dynSignCache.size > 60) { /* keep cache small */ } } }); }
  // Public: show what the simulation says is on a plot. Rebuilds only when something visible changed.
  function setPlotVisual(pid, v) {
    if (!PLOT_ANCHOR[pid]) return false;
    const key = [v.mode, v.kind, v.name, v.phase, Math.floor((v.progress ?? 1) * 8), v.paused ? 1 : 0, v.crew ? 1 : 0, v.forSale ? 1 : 0, v.closed ? 1 : 0, v.original ? 1 : 0, v.building?.kind].join('|');
    if (plotKeys[pid] === key) return false;
    plotKeys[pid] = key;
    if (plotDyn[pid]) { scene.remove(plotDyn[pid].group); disposeGroup(plotDyn[pid].group); }
    plotDyn[pid] = buildPlot(pid, v); scene.add(plotDyn[pid].group);
    if (pid === 'P005') smokeOn = v.mode === 'original' && !v.closed;
    return true;
  }
  function animatePlots(t) {
    for (const p of Object.values(plotDyn)) for (const a of p.anim) {
      if (a.kind === 'arm') a.g.rotation.x = Math.sin(t * 1.3) * .25 - .1;
      if (a.kind === 'balloon') a.g.position.y = Math.sin(t * 1.7 + a.g.position.x) * .08;
    }
  }
  const plotGroups = () => [...Object.values(plotOrig).filter(o => o.group.visible).map(o => o.group), ...Object.values(plotDyn).map(p => p.group)];
  function crewSpots(pid) { const A = PLOT_ANCHOR[pid]; if (!A) return []; const c = Math.cos(A.ry), sn = Math.sin(A.ry); return WORKER_SPOTS(A.w, A.d).map(([x, z, yaw]) => [A.x + x * c + z * sn, A.z - x * sn + z * c, yaw + A.ry]); }

  const stats = { sites: siteInfo.map(s => ({ name: s.name, x: s.x, z: s.z, min: s.full.min.toArray(), max: s.full.max.toArray() })), buildMs: Math.round(performance.now() - t0), triangles: (worldMesh.geometry.attributes.position.count + folMesh.geometry.attributes.position.count + glowMesh.geometry.attributes.position.count) / 3, locations: siteInfo.map(s => s.name) };
  return { sun, hemi, update, siteInfo, fitBoxes: siteInfo.map(s => s.box), stats, state, setPlotVisual, plotGroups, crewSpots, PLOT_ANCHOR, plotKey: pid => plotKeys[pid] };
}
