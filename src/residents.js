// Tiny Living World — residents: stylized low-poly characters, animation,
// sidewalk navigation graph and speech bubbles. Pure local logic, no network/AI.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const PI = Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ======================= CHARACTER LOOKS ======================= */
// colour = the swatch shown in the UI (kept close to v0.1 resident colours)
export const LOOKS = {
  Oliver: { scale: 1.02, skin: 0xf1c7a3, hair: ['short', 0x8a5a32], hat: ['toque', 0xffffff], top: 0xf6f3ec, sleeves: 'rolled', pants: 0x4e839a, shoes: 0x5a3e2b, apron: [0xffffff, 'long'], mustache: 0x8a5a32, swatch: 0x4e839a },
  Emma: { scale: .95, skin: 0xf6d4b8, hair: ['ponytail', 0xe8c37a], top: 0xf7b8c8, sleeves: 'short', skirt: 0xb9e3d0, legs: 0xfbe3e8, shoes: 0xdb7993, apron: [0xc8e6c9, 'short'], hairFlower: 0xff7aa2, blush: true, swatch: 0xdb7993 },
  Sarah: { scale: 1.0, skin: 0xe8b996, hair: ['bob', 0x2c1e1a], top: 0x866eb1, shirt: 0xffffff, sleeves: 'long', pants: 0x55535e, shoes: 0x2b2b2b, glasses: 0x2b2b2b, bag: 0x8a5a3b, hold: 'notepad', swatch: 0x866eb1 },
  Marcus: { scale: 1.04, skin: 0x8d5a3b, hair: ['sidepart', 0xc9c9c9], top: 0x343c4c, shirt: 0xffffff, tie: 0xc0392b, sleeves: 'long', pants: 0x343c4c, shoes: 0x1c1c1c, mustache: 0xd0d0d0, pocket: 0xf2c14e, swatch: 0x627d65 },
  Mia: { scale: .97, skin: 0xb7794f, hair: ['bun', 0x2a1a14], top: 0xde9b5b, sleeves: 'rolled', pants: 0x2f2f2f, shoes: 0x2b2b2b, apron: [0x6e4a35, 'waist'], earrings: 0xe8c35a, blush: true, hold: 'cup', swatch: 0xde9b5b },
  Noah: { scale: 1.05, skin: 0xd9a27c, hair: ['short', 0x1f1a17], hat: ['cap', 0xe07b39], top: 0x5677b2, sleeves: 'rolled', pants: 0x5677b2, overalls: true, shoes: 0x3a2a1f, beard: 0x1f1a17, hold: 'wrench', swatch: 0x5677b2 },
  Lily: { scale: .94, skin: 0xf3cfb2, hair: ['long', 0xb5523b], hat: ['beret', 0xd9493c], top: 0x2f466b, smock: 0xf3eee0, sleeves: 'long', pants: 0xa96d97, shoes: 0xffd166, hold: 'brush', blush: true, swatch: 0xa96d97 },
  // construction crew (no names in the town; they come and go with each project)
  Worker: { scale: 1.02, skin: 0xd9a27c, hair: ['short', 0x3b2a20], hat: ['hardhat', 0xf2c14e], top: 0x5c6f82, vest: 0xff8c2a, sleeves: 'rolled', pants: 0x45505c, shoes: 0x3a2a1f, hold: 'wrench', swatch: 0xff8c2a },
  Worker2: { scale: .98, skin: 0x8d5a3b, hair: ['short', 0x1f1a17], hat: ['hardhat', 0xffffff], top: 0x6e5a48, vest: 0xc6e83a, sleeves: 'long', pants: 0x3f4a6b, shoes: 0x2b2b2b, beard: 0x1f1a17, swatch: 0xc6e83a },
  Ethan: { scale: 1.06, skin: 0xc68e66, hair: ['messy', 0x3b2a20], top: 0x7f9a52, hood: true, sleeves: 'long', pants: 0x3f5f8a, shoes: 0xf2f2f2, headphones: 0x222222, swatch: 0x9d854d },
};

/* ---------- tiny merge helper (one vertex-coloured mesh per body part) ---------- */
const Geo = {
  box: new THREE.BoxGeometry(1, 1, 1), ico: new THREE.IcosahedronGeometry(1, 1), ico0: new THREE.IcosahedronGeometry(1, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8), cone: new THREE.ConeGeometry(1, 1, 8), torso: new THREE.CylinderGeometry(1, .88, 1, 8),
  torus: new THREE.TorusGeometry(1, .18, 4, 10),
};
const prepared = new Map();
const prep = g => { let n = prepared.get(g); if (!n) { n = g.index ? g.toNonIndexed() : g; prepared.set(g, n); } return n; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function at(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) { _e.set(rx, ry, rz); _q.setFromEuler(_e); return _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)).clone(); }
class Part {
  constructor() { this.items = []; }
  add(g, c, m) { this.items.push([prep(g), new THREE.Color(c), m]); return this; }
  box(c, x, y, z, w, h, d, rx, ry, rz) { return this.add(Geo.box, c, at(x, y, z, w, h, d, rx, ry, rz)); }
  ball(c, x, y, z, rx, ry = rx, rz = rx, ico0) { return this.add(ico0 ? Geo.ico0 : Geo.ico, c, at(x, y, z, rx, ry, rz)); }
  cyl(c, x, y, z, r, h, rz = r, rotx = 0, rotz = 0) { return this.add(Geo.cyl, c, at(x, y, z, r, h, rz, rotx, 0, rotz)); }
  build(mat) {
    let n = 0; for (const [g] of this.items) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), nm = new THREE.Matrix3(), v = new THREE.Vector3(); let o = 0;
    for (const [g, c, m] of this.items) {
      const P = g.attributes.position, N = g.attributes.normal; nm.getNormalMatrix(m);
      for (let i = 0; i < P.count; i++, o++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m); pos.set([v.x, v.y, v.z], o * 3);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], o * 3);
        col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = false; return mesh;
  }
}
const charMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .82 });
const darker = (c, k = .75) => new THREE.Color(c).multiplyScalar(k).getHex();

// Rig dimensions (metres, feet at y=0, facing +z, the character's right hand is at -x)
const HIP_Y = .9, SHOULDER_Y = 1.57, SHOULDER_X = .33, NECK_Y = 1.66;

/* ======================= CHARACTER BUILDER ======================= */
export function buildCharacter(name) {
  const L = LOOKS[name]; const skin = L.skin;
  const root = new THREE.Group(); root.name = 'resident:' + name;
  const body = new THREE.Group(); root.add(body);
  // ---- body (pelvis, torso, clothing) ----
  const B = new Part();
  const lower = L.skirt ?? L.pants;
  B.box(lower, 0, .95, 0, .44, .2, .28);
  if (L.skirt) B.add(Geo.cone, L.skirt, at(0, .84, 0, .34, .42, .27, PI, 0, 0)); // flared skirt (inverted cone)
  B.add(Geo.torso, L.top, at(0, 1.31, 0, .25, .66, .155));
  B.ball(L.top, 0, 1.6, 0, .27, .1, .16); // shoulder line
  B.cyl(skin, 0, 1.68, 0, .075, .12);
  if (L.shirt) B.box(L.shirt, 0, 1.48, .135, .16, .3, .04, -.08);
  if (L.tie) { B.box(L.tie, 0, 1.4, .155, .07, .32, .03, -.1); B.box(L.tie, 0, 1.56, .155, .08, .06, .04); }
  if (L.pocket) B.box(L.pocket, -.14, 1.47, .148, .07, .05, .02);
  if (L.shirt && !L.tie) for (const s of [-1, 1]) B.box(darker(L.top, .85), s * .1, 1.5, .14, .07, .26, .03, 0, 0, s * .35); // lapels
  if (L.apron) {
    const [c, kind] = L.apron;
    if (kind === 'long') { B.box(c, 0, 1.05, .17, .42, .78, .025, -.04); B.box(c, 0, 1.47, .16, .26, .22, .025); B.box(darker(c, .9), .09, 1.05, .19, .12, .12, .02); }
    else if (kind === 'short') { B.box(c, 0, 1.0, .16, .4, .42, .025, -.08); }
    else { B.box(c, 0, .8, .16, .44, .48, .025, -.05); B.box(c, 0, 1.05, 0, .46, .05, .3); }
  }
  if (L.vest) { B.add(Geo.torso, L.vest, at(0, 1.3, .004, .262, .5, .162)); for (const y of [1.18, 1.36]) B.box(0xf2f2f2, 0, y, .162, .4, .035, .012); }
  if (L.overalls) { B.box(L.pants, 0, 1.16, .145, .32, .32, .03); for (const s of [-1, 1]) B.box(darker(L.pants, .8), s * .12, 1.45, .14, .05, .34, .03); B.box(0x2b2b2b, .07, 1.0, .16, .14, .14, .02); B.ball(0x2b2b2b, -.1, 1.2, .15, .04, .04, .01, true); }
  if (L.smock) { B.add(Geo.torso, L.smock, at(0, 1.18, .005, .265, .58, .165)); for (const [x, y, c] of [[.08, 1.2, 0xd9493c], [-.1, 1.05, 0xffd166], [.12, .98, 0x6fa8ff], [-.05, 1.32, 0x5fa04f]]) B.ball(c, x, y, .17, .035, .035, .012, true); }
  if (L.hood) { B.ball(darker(L.top, .9), 0, 1.66, -.13, .2, .13, .1); B.box(darker(L.top, .85), 0, 1.13, .15, .26, .14, .03); for (const s of [-1, 1]) B.box(0xffffff, s * .05, 1.48, .155, .015, .14, .015); }
  if (L.headphones) B.add(Geo.torus, L.headphones, at(0, 1.66, .02, .16, .16, .16, PI / 2 + .3, 0, 0));
  if (L.bag) { B.box(L.bag, .24, .98, .02, .1, .26, .3); B.box(darker(L.bag, .8), 0, 1.33, .0, .05, .78, .33, 0, 0, -.62); }
  const bodyMesh = B.build(charMat); body.add(bodyMesh);
  // ---- head ----
  const head = new THREE.Group(); head.position.set(0, NECK_Y, 0); body.add(head);
  const H = new Part();
  H.ball(skin, 0, .3, 0, .27, .29, .26);
  for (const s of [-1, 1]) H.ball(darker(skin, .95), s * .265, .29, -.01, .05, .07, .05, true); // ears
  const hc = L.hair[1];
  for (const s of [-1, 1]) { H.box(0x2a2522, s * .095, .31, .245, .055, .07, .04); H.box(0xffffff, s * .095 + .012, .33, .262, .016, .016, .01); H.box(hc, s * .1, .395, .238, .1, .025, .03, 0, 0, s * -.12); }
  H.box(darker(skin, .88), 0, .25, .262, .05, .06, .04);
  H.box(0x9c4a4a, 0, .175, .243, .1, .022, .03);
  if (L.blush) for (const s of [-1, 1]) H.box(0xf19a9a, s * .16, .22, .225, .06, .03, .02);
  if (L.mustache) H.box(L.mustache, 0, .205, .26, .16, .04, .04);
  if (L.beard) { H.box(L.beard, 0, .14, .19, .3, .14, .14); H.box(L.beard, 0, .2, .245, .18, .035, .03); }
  if (L.glasses) { for (const s of [-1, 1]) { H.box(L.glasses, s * .095, .31, .268, .11, .015, .01); H.box(L.glasses, s * .095, .26, .268, .11, .015, .01); H.box(L.glasses, s * .15, .285, .268, .015, .06, .01); H.box(L.glasses, s * .04, .285, .268, .015, .06, .01); } H.box(L.glasses, 0, .3, .268, .05, .015, .01); }
  if (L.earrings) for (const s of [-1, 1]) H.ball(L.earrings, s * .27, .2, 0, .025);
  hair(H, L.hair[0], hc);
  if (L.hat) hat(H, L.hat[0], L.hat[1]);
  if (L.hairFlower) { H.ball(L.hairFlower, -.2, .45, .1, .055, .055, .03, true); H.ball(0xffd166, -.2, .45, .13, .02); }
  const headMesh = H.build(charMat); head.add(headMesh);
  // ---- limbs ----
  const limb = (side, isArm) => {
    const g = new THREE.Group(), P = new Part();
    if (isArm) {
      g.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
      const sleeve = L.top, fore = L.sleeves === 'long' ? sleeve : L.sleeves === 'rolled' ? null : skin;
      P.box(sleeve, 0, -.17, 0, .14, .36, .15);
      if (fore) P.box(fore, 0, -.47, 0, .125, .3, .14); else { P.box(darker(sleeve, .92), 0, -.37, 0, .135, .08, .145); P.box(skin, 0, -.5, 0, .12, .26, .13); }
      P.ball(skin, 0, -.67, .01, .075, .085, .075);
      const holdRight = side < 0; // right hand is at -x
      if (holdRight && L.hold === 'wrench') { P.box(0x9aa3ab, 0, -.68, .14, .04, .04, .26); P.box(0x9aa3ab, 0, -.68, .28, .09, .04, .05); }
      if (holdRight && L.hold === 'brush') { P.box(0xc49a6c, 0, -.66, .13, .025, .025, .24); P.box(0xd9493c, 0, -.66, .26, .035, .035, .05); }
      if (holdRight && L.hold === 'cup') { P.cyl(0xffffff, 0, -.7, .1, .05, .09); P.cyl(0x4a2c1d, 0, -.655, .1, .043, .01); }
      if (!holdRight && L.hold === 'notepad') P.box(0xfff8e1, 0, -.68, .11, .14, .02, .18, .2);
    } else {
      g.position.set(side * .12, HIP_Y, 0);
      P.box(L.legs ?? L.pants, 0, -.42, 0, .17, .8, .19);
      P.box(L.shoes, 0, -.84, .05, .2, .12, .32);
      if (L.shoes === 0xf2f2f2) P.box(0xd9493c, 0, -.88, .05, .21, .04, .33);
    }
    const mesh = P.build(charMat); g.add(mesh); body.add(g); return g;
  };
  const legL = limb(1, false), legR = limb(-1, false), armL = limb(1, true), armR = limb(-1, true);
  // generous invisible tap target (raycast only hits these)
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, 2.4, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 1.2; hit.name = 'hit'; root.add(hit);
  root.scale.setScalar(L.scale);
  return { root, rig: { body, head, legL, legR, armL, armR }, hit, swatch: L.swatch };
}
function hair(H, style, c) {
  const top = () => H.ball(c, 0, .38, -.015, .285, .2, .275);
  if (style === 'short') { top(); H.box(c, 0, .3, -.13, .5, .26, .2); for (const s of [-1, 1]) H.box(c, s * .245, .3, .05, .05, .14, .14); }
  else if (style === 'sidepart') { top(); H.box(c, 0, .3, -.13, .52, .24, .2); for (const s of [-1, 1]) H.box(c, s * .25, .28, .04, .05, .14, .14); H.box(darker(c, .9), .08, .52, .12, .22, .05, .12, 0, 0, .15); }
  else if (style === 'bob') { top(); H.box(c, 0, .22, -.11, .58, .38, .26); for (const s of [-1, 1]) H.box(c, s * .27, .2, .07, .06, .36, .2); H.box(c, -.06, .44, .2, .36, .08, .08, 0, 0, .12); }
  else if (style === 'long') { top(); H.box(c, 0, .08, -.14, .54, .66, .16); for (const s of [-1, 1]) H.box(c, s * .27, .12, .06, .06, .48, .17); H.box(c, 0, .45, .2, .4, .07, .07); }
  else if (style === 'ponytail') { top(); H.box(c, 0, .3, -.13, .5, .26, .2); H.ball(c, 0, .36, -.3, .1, .1, .1); H.box(c, 0, .1, -.34, .12, .38, .1, .25); for (const s of [-1, 1]) H.box(c, s * .2, .42, .19, .16, .06, .07, 0, 0, s * .3); }
  else if (style === 'bun') { top(); H.box(c, 0, .3, -.13, .5, .24, .2); H.ball(c, 0, .58, -.1, .14, .12, .14); for (const s of [-1, 1]) H.box(c, s * .2, .42, .19, .18, .06, .07, 0, 0, s * .25); }
  else if (style === 'messy') { top(); H.box(c, 0, .3, -.13, .5, .26, .2); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; H.add(Geo.cone, c, at(Math.cos(a) * .15, .5, Math.sin(a) * .13 - .02, .07, .16, .07, Math.sin(a) * .5, 0, -Math.cos(a) * .5)); } }
}
function hat(H, kind, c) {
  if (kind === 'toque') { H.cyl(c, 0, .5, 0, .27, .14, .26); H.ball(c, 0, .7, 0, .3, .2, .29); H.ball(c, .1, .74, .06, .14); H.ball(c, -.1, .75, -.05, .15); }
  if (kind === 'cap') { H.ball(c, 0, .44, 0, .29, .14, .28); H.box(c, 0, .43, .25, .3, .03, .22); H.box(0xffffff, 0, .52, .25, .1, .06, .02); }
  if (kind === 'hardhat') { H.ball(c, 0, .45, 0, .3, .2, .3); H.cyl(c, 0, .43, .02, .34, .03, .35); H.box(darker(c, .85), 0, .6, 0, .05, .06, .44); }
  if (kind === 'beret') { H.add(Geo.cyl, c, at(.03, .52, 0, .3, .08, .29, 0, 0, .22)); H.ball(c, .05, .58, 0, .04); }
}

/* ======================= ANIMATION ======================= */
const SEATED = new Set(['sit', 'sip', 'sketch', 'sitTalk']);
export function animateCharacter(r, dt, t) {
  const j = r.joints || (r.joints = { lL: 0, lR: 0, aLx: 0, aRx: 0, aLz: .08, aRz: -.08, by: 0, brx: 0, hx: 0, hy: 0 });
  const { body, head, legL, legR, armL, armR } = r.rig;
  const pose = r.pose || 'idle';
  // walk cycle driven by distance actually covered (stays correct at any sim speed)
  r.walkW += (((r.walkingVis ?? r.walking) ? 1 : 0) - r.walkW) * (1 - Math.exp(-dt * 10));
  const w = r.walkW, ph = r.phase, s = Math.sin(ph);
  const T = { lL: 0, lR: 0, aLx: 0, aRx: 0, aLz: .08, aRz: -.08, by: 0, brx: 0, hx: 0, hy: 0 };
  const breathe = Math.sin(t * 1.8 + r.id) * .012;
  // idle look-around
  if ((r.lookT = (r.lookT || 0) - dt) < 0) { r.lookT = 2.5 + ((r.id * 7 + Math.floor(t)) % 5); r.lookYaw = ((Math.sin(t * 3.1 + r.id * 11) + 1) / 2 - .5) * 1.1; }
  T.hy = r.lookYaw || 0;
  switch (pose) {
    case 'sit': case 'sitTalk': case 'sip': case 'sketch':
      T.lL = T.lR = -1.45; T.by = -.43; T.aLx = T.aRx = -.4; T.aLz = .12; T.aRz = -.12;
      if (pose === 'sip') { const p = Math.max(0, Math.sin(t * .9 + r.id)) ** 6; T.aRx = -.4 - 1.75 * p; T.aRz = -.32 * p - .1; T.hx = -.18 * p; }
      if (pose === 'sketch') { T.aLx = -1.15; T.aLz = -.25; T.aRx = -1.0 + Math.sin(t * 6) * .12; T.aRz = .2 + Math.cos(t * 6) * .08; T.hx = .38; T.hy = 0; }
      if (pose === 'sitTalk') { T.aRx = -.7 + Math.sin(t * 3) * .35; T.hx = Math.sin(t * 4) * .07; T.hy = 0; }
      break;
    case 'garden': T.lL = T.lR = -.95; T.by = -.32; T.brx = .5; T.aLx = -1.0 + Math.sin(t * 4) * .3; T.aRx = -1.0 - Math.sin(t * 4) * .3; T.hx = .2; T.hy = 0; break;
    case 'work': T.lL = -.9; T.lR = -.6; T.by = -.28; T.brx = .55; T.aRx = -1.25 + Math.sin(t * 7) * .35; T.aLx = -.9; T.hx = .25; T.hy = 0; break;
    case 'browse': T.brx = .12; T.aRx = -.95 + Math.sin(t * 1.5) * .25; T.aLx = -.15; T.hx = .28; T.hy = Math.sin(t * .6) * .5; break;
    case 'read': T.aLx = T.aRx = -1.05; T.aLz = -.28; T.aRz = .28; T.hx = .36; T.hy = 0; break;
    case 'watch': T.aLx = T.aRx = .38; T.aLz = -.05; T.aRz = .05; T.hy = Math.sin(t * .35 + r.id) * .6; break;
    case 'talk': T.aRx = -.6 + Math.sin(t * 3) * .4; T.aLx = -.2 + Math.sin(t * 2.3 + 1) * .25; T.aLz = .25; T.hx = Math.sin(t * 4) * .07; T.hy = 0; break;
    case 'wave': T.aRz = -2.55 + Math.sin(t * 11) * .3; T.aRx = -.2; T.hy = 0; break;
  }
  // blend walking on top
  T.lL += s * .62 * w; T.lR -= s * .62 * w; T.aLx += -s * .5 * w; T.aRx += s * .5 * w;
  T.by += Math.abs(s) * .05 * w; T.brx += .06 * w;
  const k = 1 - Math.exp(-dt * 9);
  for (const key in T) j[key] += (T[key] - j[key]) * k;
  legL.rotation.x = j.lL; legR.rotation.x = j.lR;
  armL.rotation.set(j.aLx, 0, j.aLz); armR.rotation.set(j.aRx, 0, j.aRz);
  body.position.y = j.by + (SEATED.has(pose) ? 0 : breathe * .5); body.rotation.x = j.brx;
  body.scale.y = 1 + breathe;
  head.rotation.set(j.hx, j.hy, 0);
}

/* ======================= SPEECH BUBBLES ======================= */
const bubbleTex = {};
function drawBubble(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.strokeStyle = 'rgba(40,60,58,.35)'; x.lineWidth = 4;
  x.beginPath(); x.roundRect(10, 10, 108, 82, 26); x.moveTo(50, 90); x.lineTo(62, 116); x.lineTo(76, 90); x.fill(); x.stroke();
  x.fillStyle = '#fff'; x.fillRect(48, 84, 30, 10);
  const cx = 64, cy = 51;
  if (kind === 'talk') { x.fillStyle = '#4a5a58'; for (const dx of [-24, 0, 24]) { x.beginPath(); x.arc(cx + dx, cy, 8, 0, PI * 2); x.fill(); } }
  if (kind === 'heart') { x.fillStyle = '#ff5f87'; x.beginPath(); x.moveTo(cx, cy + 24); x.bezierCurveTo(cx - 40, cy - 2, cx - 18, cy - 34, cx, cy - 12); x.bezierCurveTo(cx + 18, cy - 34, cx + 40, cy - 2, cx, cy + 24); x.fill(); }
  if (kind === 'hi') { x.fillStyle = '#e8862e'; x.font = '800 46px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Hi!', cx, cy + 2); }
  if (kind === 'note') { x.fillStyle = '#6f5bd6'; x.beginPath(); x.ellipse(cx - 12, cy + 16, 12, 9, -.4, 0, PI * 2); x.fill(); x.fillRect(cx - 2, cy - 26, 6, 42); x.fillRect(cx - 2, cy - 26, 26, 8); }
  if (kind === 'cup') { x.fillStyle = '#8a5a3b'; x.fillRect(cx - 24, cy - 12, 36, 32); x.lineWidth = 6; x.strokeStyle = '#8a5a3b'; x.beginPath(); x.arc(cx + 14, cy + 3, 9, -PI / 2, PI / 2); x.stroke(); x.strokeStyle = '#b9c9c6'; x.lineWidth = 4; for (const dx of [-14, -2]) { x.beginPath(); x.moveTo(cx + dx, cy - 18); x.quadraticCurveTo(cx + dx + 8, cy - 26, cx + dx, cy - 34); x.stroke(); } }
  if (kind === 'zzz') { x.fillStyle = '#5f7d95'; x.font = '800 34px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText('z', cx - 18, cy + 18); x.font = '800 44px system-ui, sans-serif'; x.fillText('Z', cx + 12, cy + 8); }
  if (kind === 'argue') { x.fillStyle = '#d9493c'; x.font = '900 52px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!?', cx, cy + 2); }
  if (kind === 'flower') { for (let k = 0; k < 5; k++) { const a = k * PI * 2 / 5; x.fillStyle = '#ff7aa2'; x.beginPath(); x.arc(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, 11, 0, PI * 2); x.fill(); } x.fillStyle = '#ffd166'; x.beginPath(); x.arc(cx, cy, 9, 0, PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeBubble() {
  const m = new THREE.SpriteMaterial({ map: null, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(m); sp.scale.set(.85, .85, 1); sp.position.y = 2.75; sp.visible = false; sp.renderOrder = 3;
  sp.show = kind => { if (!bubbleTex[kind]) bubbleTex[kind] = drawBubble(kind); if (m.map !== bubbleTex[kind]) { m.map = bubbleTex[kind]; m.needsUpdate = true; } sp.visible = true; sp.kind = kind; };
  sp.hide = () => { sp.visible = false; sp.kind = null; };
  return sp;
}

/* ======================= NAVIGATION ======================= */
// Building footprints (world x0,z0,x1,z1) — residents must never walk inside these.
export const FOOTPRINTS = [
  { site: 0, r: [-23.35, -22.75, -16.65, -17.25] },  // Oliver's Cottage
  { site: 1, r: [-10.45, -22.85, -3.55, -17.15] },   // Emma's House
  { site: 1, r: [-10.25, -17.25, -3.75, -15.45], porch: true }, // Emma's porch (entered by the steps only)
  { site: 2, r: [3.75, -23.15, 10.25, -16.85] },     // Sarah's House
  { site: 2, r: [4.35, -16.9, 6.65, -16.0] },        // Sarah's bay window
  { site: 3, r: [16.35, -23.15, 23.65, -18.45] },    // Shared House (main)
  { site: 3, r: [21.65, -19.65, 25.15, -16.45] },    // Shared House (wing)
  { site: 4, r: [-23.75, -2.95, -16.25, 2.95] },     // Sunrise Bakery
  { site: 6, r: [3.55, -2.85, 10.45, 2.85] },        // Petal & Stem
  { site: 7, r: [17.35, -2.95, 24.65, 2.95] },       // Corner Café
  { site: 8, r: [3.4, 16.3, 10.6, 22.85] },          // Town Hall
  { site: 5, r: [-8.75, -6.2, -5.25, -2.8] },        // park fountain
  { site: 11, r: [-27.4, 17.85, -18.6, 24.15] },     // duck pond
];
// Buildings that come and go (new construction on open lots) register their footprint here.
export function setDynamicFootprint(site, rect) {
  const i = FOOTPRINTS.findIndex(f => f.dynamic && f.site === site);
  if (i >= 0) FOOTPRINTS.splice(i, 1);
  if (rect) FOOTPRINTS.push({ site, r: rect, dynamic: true });
}
export const insideFootprint = (x, z, pad = 0) => FOOTPRINTS.find(f => !f.porch && x > f.r[0] - pad && x < f.r[2] + pad && z > f.r[1] - pad && z < f.r[3] + pad) || null;
function segHitsRect(ax, az, bx, bz, [x0, z0, x1, z1]) { // Liang–Barsky
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) { if (p === 0) { if (q < 0) return false; continue; } const u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
  return t0 < t1;
}
export const segmentBlocked = (ax, az, bx, bz) => FOOTPRINTS.some(f => segHitsRect(ax, az, bx, bz, f.r));

export function createNav() {
  const nodes = [], adj = [];
  const add = (x, z, y = 0) => { nodes.push({ x, z, y }); adj.push([]); return nodes.length - 1; };
  const link = (a, b) => { const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z) + Math.abs(nodes[a].y - nodes[b].y); adj[a].push([b, d]); adj[b].push([a, d]); };
  // Sidewalk centre lines (just inside each road's curb) — crossings happen at the crosswalks.
  const XL = [-15.35, -10.65, -2.35, 2.35, 10.65, 15.35], ZL = [-12.45, -7.55, 5.55, 10.45];
  const onX = new Map(XL.map(x => [x, []])), onZ = new Map(ZL.map(z => [z, []]));
  for (const x of XL) for (const z of ZL) { const id = add(x, z); onX.get(x).push(id); onZ.get(z).push(id); }
  for (const x of XL) for (const z of [-28.5, 28.5]) onX.get(x).push(add(x, z));
  for (const z of ZL) for (const x of [-30.5, 30.5]) onZ.get(z).push(add(x, z));
  const onLineZ = (x, z) => { const id = add(x, z); onZ.get(z).push(id); return id; };
  const onLineX = (x, z) => { const id = add(x, z); onX.get(x).push(id); return id; };
  const spot = (x, z, yaw, act, from, y = 0, seat = false) => { const node = add(x, z, y); link(node, from); return { node, x, z, y, yaw, act, seat: seat || act === 'sit' || act === 'sip', owner: -1 }; };
  const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const seatAt = (tx, tz, chairs, i, from, act = 'sip') => { const a = i / chairs * PI * 2 + .4, x = tx + Math.cos(a) * .85, z = tz + Math.sin(a) * .85; return spot(x, z, face(x, z, tx, tz), act, from, 0, true); };
  const S = [];
  { // 0 Oliver's Cottage
    const E = add(-20, -16.2); link(E, onLineZ(-20, -12.45));
    S[0] = { E, inside: true, spots: [spot(-23.9, -15.0, -PI / 2, 'garden', E), spot(-17.6, -13.95, PI, 'garden', E)] };
  }
  { // 1 Emma's House (porch reached by the front steps)
    const E = add(-7, -14.55); link(E, onLineZ(-7, -12.45));
    const top = add(-7, -15.85, .42); link(E, top);
    S[1] = { E, door: top, inside: true, spots: [spot(-9.0, -16.45, 0, 'sit', top, .42), spot(-8.9, -13.75, PI, 'garden', E)] };
  }
  { // 2 Sarah's House
    const E = add(8.65, -16.15); link(E, onLineZ(8.65, -12.45));
    S[2] = { E, inside: true, spots: [spot(5.4, -14.45, 0, 'garden', E)] };
  }
  { // 3 Shared House (two front doors)
    const E = add(18.4, -17.5); link(E, onLineZ(18.4, -12.45));
    const E2 = add(23.4, -15.8); link(E2, onLineZ(23.4, -12.45)); const mid = add(20.6, -15.6); link(E, mid); link(mid, E2); // around the wing
    S[3] = { E, inside: true, spots: [spot(28.3, -14.75, PI, 'garden', E2), spot(26.6, -14.6, PI, 'work', E2)] };
  }
  { // 4 Sunrise Bakery (+ patio seats)
    const E = add(-20, 3.65); link(E, onLineZ(-20, 5.55));
    const P = add(-24.15, 3.8); link(E, P);
    S[4] = { E, inside: true, spots: [seatAt(-26, 2.6, 2, 0, P), seatAt(-26, 2.6, 2, 1, P), seatAt(-27.2, 0, 3, 0, P), seatAt(-28.6, 2.6, 2, 0, P)] };
  }
  { // 5 Willowbrook Park (no building: plaza, benches, fountain)
    const C = add(-7, 0), arch = add(-7, 4.4); link(arch, onLineZ(-7, 5.55)); link(arch, C);
    link(C, onLineX(-10.65, 0)); link(C, onLineX(-2.35, 0));
    // north path detours around the fountain
    const n1 = add(-7, -2.3), n2 = add(-4.7, -2.6), n2b = add(-4.7, -4.5), n3 = add(-4.7, -6.4), n4 = add(-7, -6.75);
    link(C, n1); link(n1, n2); link(n2, n2b); link(n2b, n3); link(n3, n4); link(n4, onLineZ(-7, -7.55));
    const benches = [[1.78, 1.78], [-1.78, 1.78], [1.78, -1.78], [-1.78, -1.78]].map(([bx, bz]) => spot(-7 + bx, bz, Math.atan2(-bx, -bz), 'sit', C));
    S[5] = { E: C, inside: false, spots: [...benches, spot(-5.0, -4.5, -PI / 2, 'watch', n2b)] };
  }
  { // 6 Petal & Stem
    const E = add(7, 3.6), g = onLineZ(7, 5.55); link(E, g);
    S[6] = { E, inside: true, spots: [spot(4.7, 5.15, PI, 'browse', g), spot(9.3, 5.15, PI, 'browse', g)] };
  }
  { // 7 Corner Café (+ patio)
    const E = add(21, 3.6); link(E, onLineZ(21, 5.55));
    const P = add(25.0, 3.75); link(E, P); const A = add(27.9, 1.2); link(P, A);
    S[7] = { E, inside: true, spots: [seatAt(26.5, 3.0, 2, 1, P), seatAt(26.5, 3.0, 2, 0, A), seatAt(29.3, 3.0, 2, 1, A), seatAt(26.5, -.6, 3, 1, A), seatAt(26.5, -.6, 3, 0, A), seatAt(29.3, -.6, 2, 1, A)] };
  }
  { // 8 Town Hall (front faces north; reached along the foot of the steps)
    const E = add(7, 24.3, .2); link(E, onLineX(2.35, 24.3)); link(E, onLineX(10.65, 24.3));
    S[8] = { E, inside: true, spots: [spot(7.7, 24.05, PI, 'read', E, .2), spot(7, 29.0, 0, 'watch', E)] };
  }
  // 9 / 10 — the Orchard Road lots: open land (garden, orchard) or, once built on, a shop facing Orchard Road
  const lot = (x, land) => {
    const B = add(x, 12.9); link(B, onLineZ(x, 10.45));
    return { land, built: { E: B, inside: true, spots: [] } };
  };
  { // 9 Community Garden (gate on the south side)
    const E = add(-6.5, 26.0); link(E, onLineX(-10.65, 26.0)); link(E, onLineX(-2.35, 26.0));
    S[9] = { ...lot(-6.5, { E, inside: false, spots: [spot(-6.6, 24.55, PI, 'garden', E), spot(-4.9, 26.35, PI, 'watch', E)] }) };
  }
  { // 10 Old Orchard (picnic corner at the back)
    const E = add(22.5, 28.0); link(E, onLineX(15.35, 28.0));
    S[10] = { ...lot(22.5, { E, inside: false, spots: [spot(24.1, 26.45, 0, 'sit', E), spot(20.4, 27.2, PI, 'watch', E)] }) };
  }
  { // 11 Duck Pond (bench and lakeside path)
    const E = add(-21.2, 27.0); link(E, onLineX(-15.35, 27.0)); const n1 = add(-21.0, 25.0); link(E, n1);
    S[11] = { E, inside: false, spots: [spot(-23.0, 25.35, PI, 'sit', n1), spot(-20.6, 25.4, PI - .5, 'watch', n1)] };
  }
  const setLot = (si, mode) => { const v = S[si][mode === 'built' ? 'built' : 'land']; Object.assign(S[si], { E: v.E, inside: v.inside, spots: v.spots, mode }); };
  setLot(9, 'land'); setLot(10, 'land');
  for (const ids of onX.values()) { ids.sort((a, b) => nodes[a].z - nodes[b].z); for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]); }
  for (const ids of onZ.values()) { ids.sort((a, b) => nodes[a].x - nodes[b].x); for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]); }

  // Dijkstra from a free position (joined to nearby nodes it can see) to a target node
  function path(from, target) {
    const N = nodes.length, dist = new Float64Array(N + 1).fill(Infinity), prev = new Int32Array(N + 1).fill(-1), done = new Uint8Array(N + 1);
    const start = N; dist[start] = 0;
    const cands = nodes.map((n, i) => [i, Math.hypot(n.x - from.x, n.z - from.z)]).sort((a, b) => a[1] - b[1]);
    const startEdges = [];
    for (const [i, d] of cands) { if (startEdges.length >= 3 || d > 18) break; if (!segmentBlocked(from.x, from.z, nodes[i].x, nodes[i].z)) startEdges.push([i, d]); }
    if (!startEdges.length) startEdges.push(cands[0]);
    for (;;) {
      let u = -1, best = Infinity; for (let i = 0; i <= N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === target) break; done[u] = 1;
      for (const [v, w] of (u === start ? startEdges : adj[u])) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    const out = []; for (let u = target; u !== -1 && u !== start; u = prev[u]) out.push(nodes[u]);
    out.reverse();
    if (out.length && Math.hypot(out[0].x - from.x, out[0].z - from.z) < .05) out.shift();
    return out.map(n => ({ x: n.x, y: n.y, z: n.z }));
  }
  return { nodes, sites: S, path, node: i => nodes[i], adjacency: adj, setLot };
}

/* ======================= MOOD ======================= */
export function moodOf(r) {
  const low = [r.energy < 30 && 'tired', r.hunger < 30 && 'hungry', r.social < 30 && 'lonely'].filter(Boolean);
  const avg = (r.energy + r.hunger + r.social) / 3;
  if (low.length >= 2) return { label: 'Grumpy', emoji: '😣', key: 'grumpy' };
  if (low[0] === 'tired') return { label: 'Sleepy', emoji: '😴', key: 'tired' };
  if (low[0] === 'hungry') return { label: 'Hungry', emoji: '😋', key: 'hungry' };
  if (low[0] === 'lonely') return { label: 'Lonely', emoji: '😔', key: 'lonely' };
  if (avg > 72) return { label: 'Cheerful', emoji: '😊', key: 'cheerful' };
  if (avg > 50) return { label: 'Content', emoji: '🙂', key: 'content' };
  return { label: 'Meh', emoji: '😐', key: 'meh' };
}
