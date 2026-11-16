'use strict';
/* 公共工具：随机数、几何合并、程序化纹理、路径 */
window.ML = {};
(function (ML) {
  // 可复现的随机数
  ML.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  ML.lerp = (a, b, t) => a + (b - a) * t;
  ML.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  ML.smooth = t => t * t * (3 - 2 * t);

  ML.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
    return c;
  };
  ML.tex = function (canvas, opts) {
    const t = new THREE.CanvasTexture(canvas);
    opts = opts || {};
    if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
    t.anisotropy = ML.maxAniso || 8;
    return t;
  };

  // 往画布上撒颗粒，让大色块不那么“塑料”
  ML.speckle = function (ctx, w, h, n, rnd, dark, light, size) {
    for (let i = 0; i < n; i++) {
      const v = rnd();
      ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${dark * rnd()})` : `rgba(255,255,255,${light * rnd()})`;
      const s = (size || 2) * (0.5 + rnd());
      ctx.fillRect(rnd() * w, rnd() * h, s, s);
    }
  };

  // 值噪声（可平铺），用于水面法线、云等
  ML.noiseField = function (size, cells, rnd) {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * cells, fy = y / size * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = ML.smooth(fx - x0), ty = ML.smooth(fy - y0);
      const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
      out[y * size + x] = ML.lerp(ML.lerp(a, b, tx), ML.lerp(c, d, tx), ty);
    }
    return out;
  };
  ML.fbmField = function (size, rnd) {
    const out = new Float32Array(size * size);
    let amp = 0.5, cells = 4;
    for (let o = 0; o < 5; o++) {
      const f = ML.noiseField(size, cells, rnd);
      for (let i = 0; i < out.length; i++) out[i] += f[i] * amp;
      amp *= 0.5; cells *= 2;
    }
    return out;
  };
  // 高度场 → 法线贴图
  ML.normalMap = function (size, strength, rnd) {
    const f = ML.fbmField(size, rnd);
    const c = ML.canvas(size, size), ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = f[y * size + (x + size - 1) % size], r = f[y * size + (x + 1) % size];
      const u = f[((y + size - 1) % size) * size + x], d = f[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return ML.tex(c, { srgb: false, repeat: [1, 1] });
  };

  // 合并若干几何体（只保留 position / normal / uv，可选顶点色）
  ML.merge = function (list, colors) {
    const parts = list.map(g => g.index ? g.toNonIndexed() : g);
    let n = 0; parts.forEach(g => n += g.attributes.position.count);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const col = colors ? new Float32Array(n * 3) : null;
    let o = 0;
    parts.forEach((g, gi) => {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (col) { const k = new THREE.Color(colors[gi]); for (let i = 0; i < c; i++) { col[(o + i) * 3] = k.r; col[(o + i) * 3 + 1] = k.g; col[(o + i) * 3 + 2] = k.b; } }
      o += c;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  };

  ML.inPoly = function (x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  ML.inRect = (x, z, r, pad) => x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad;

  // 折线 → 圆滑路径，按路程取点
  ML.Path = function (pts, closed, tension) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], 0, p[1])), !!closed, 'catmullrom', tension == null ? 0.12 : tension);
    this.length = curve.getLength();
    const n = Math.max(8, Math.ceil(this.length / 1.5));
    this.pts = curve.getSpacedPoints(n);
    this.closed = !!closed;
    this.step = this.length / n;
  };
  ML.Path.prototype.at = function (dist, out) {
    const n = this.pts.length - 1;
    let d = this.closed ? ((dist % this.length) + this.length) % this.length : ML.clamp(dist, 0, this.length - 0.001);
    const f = d / this.step, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    const a = this.pts[i], b = this.pts[i + 1];
    out.x = ML.lerp(a.x, b.x, t); out.z = ML.lerp(a.z, b.z, t);
    out.tx = b.x - a.x; out.tz = b.z - a.z;
    const l = Math.hypot(out.tx, out.tz) || 1; out.tx /= l; out.tz /= l;
    return out;
  };

  // 沿折线铺一条带子（道路、河岸）
  ML.ribbon = function (pts, width, y, uvScale) {
    const pos = [], uv = [], idx = [];
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      if (i > 0) dist += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      pos.push(p.x + tz * width / 2, y, p.z - tx * width / 2, p.x - tz * width / 2, y, p.z + tx * width / 2);
      uv.push(0, dist / uvScale, 1, dist / uvScale);
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k, k - 1, k + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
})(window.ML);
