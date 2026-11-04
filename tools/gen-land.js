// gen-land.js — 解码 world-atlas land-110m.json (Natural Earth public domain,
// 经 TopoJSON 封装, MIT 许可) → 简化多边形 → js/data/land.js
// 仅开发期使用; 游戏本体不依赖本文件。
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'land-110m.json');
const OUT = path.join(__dirname, '..', 'js', 'data', 'land.js');

const topo = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const sx = topo.transform.scale[0], sy = topo.transform.scale[1];
const tx = topo.transform.translate[0], ty = topo.transform.translate[1];

// 解码全部弧段为绝对坐标
const arcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => {
    x += dx; y += dy;
    return [x * sx + tx, y * sy + ty];
  });
});

function ringFromArcIndices(idxs) {
  const pts = [];
  for (const idx of idxs) {
    let a = idx, rev = false;
    if (idx < 0) { a = ~idx; rev = true; }
    let seg = arcs[a];
    if (rev) seg = seg.slice().reverse();
    for (const p of seg) {
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }
  }
  if (pts.length > 2) {
    const f = pts[0], l = pts[pts.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) pts.pop();
  }
  return pts;
}

function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

// Douglas-Peucker 简化
function simplify(r, tol) {
  if (r.length < 5) return r;
  const keep = new Uint8Array(r.length);
  keep[0] = keep[r.length - 1] = 1;
  const stack = [[0, r.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b <= a + 1) continue;
    const ax = r[a][0], ay = r[a][1], bx = r[b][0], by = r[b][1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = r[i][0] - ax, py = r[i][1] - ay;
      let t = (px * dx + py * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = px - t * dx, cy = py - t * dy;
      const d2 = cx * cx + cy * cy;
      if (d2 > best) { best = d2; bi = i; }
    }
    if (best > tol * tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  const out = [];
  for (let i = 0; i < r.length; i++) if (keep[i]) out.push(r[i]);
  return out;
}

const geom = topo.objects.land;
const rings = [];
function walk(g) {
  if (g.type === 'MultiPolygon') {
    for (const poly of g.arcs) {
      // poly: 外环+内环; 内环(湖泊)丢弃, 只取外环
      const outer = ringFromArcIndices(poly[0]);
      rings.push(outer);
    }
  } else if (g.type === 'GeometryCollection') {
    g.geometries.forEach(walk);
  }
}
walk(geom);

const MIN_AREA = 1.1;   // 平方度, 过滤小岛(保留冰岛/马达加斯加/新西兰/日本主岛)
const TOL = 0.55;        // 简化容差(度)
const out = [];
let rawPts = 0, outPts = 0;
for (const r of rings) {
  const area = Math.abs(ringArea(r));
  if (area < MIN_AREA) continue;
  let s = simplify(r, TOL);
  if (s.length < 4) continue;
  // 裁剪: 纬度超出 [-58, 85] 的点直接丢弃并断环
  rawPts += r.length; outPts += s.length;
  const flat = [];
  for (const [lon, lat] of s) flat.push(Math.round(lon * 100) / 100, Math.round(lat * 100) / 100);
  out.push(flat);
}

const header = '// 由 tools/gen-land.js 生成 — 数据来源: world-atlas(land-110m, Natural Earth 公有领域)\n'
  + '// 多边形为风格化简化轮廓, 仅用于游戏背景绘制。\n';
const body = 'MW.LAND = {\n  tol: ' + TOL + ', minArea: ' + MIN_AREA + ', polys: [\n'
  + out.map(f => '  [' + f.join(',') + ']').join(',\n') + '\n]};\n';
fs.writeFileSync(OUT, header + body);
console.log('rings kept:', out.length, '| pts raw:', rawPts, '-> simplified:', outPts, '| size:', ((header.length + body.length) / 1024).toFixed(1) + 'KB');
