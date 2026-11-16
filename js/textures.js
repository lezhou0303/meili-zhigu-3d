'use strict';
/* 程序化纹理：楼体立面、屋面、园区地面 */
(function (ML) {
  const ORANGE = '#e2702a';
  const BAND = '#3b4046';

  function glassColor(rnd) {
    const l = 20 + rnd() * 12;
    return `hsl(${205 + rnd() * 12},${22 + rnd() * 12}%,${l}%)`;
  }
  function litColor(rnd) {
    const v = rnd();
    if (v < 0.6) return `rgba(255,${205 + rnd() * 30 | 0},${140 + rnd() * 40 | 0},${0.55 + rnd() * 0.45})`;
    return `rgba(${215 + rnd() * 30 | 0},${232 + rnd() * 20 | 0},255,${0.5 + rnd() * 0.5})`;
  }

  /* 一面墙。b 楼栋，side n/s/e/w，len 墙长（米），H 墙高，floors 各层层高
     返回 { map, emissiveMap, rmMap }（rm：G=粗糙度 B=金属度，玻璃做成能映出天空） */
  ML.facade = function (b, side, len, H, floors, opt) {
    opt = opt || {};
    const S = 16, E = 8;
    const rnd = ML.rng(b.id * 131 + side.charCodeAt(0) * 7 + (opt.seed || 0));
    const c = ML.canvas(len * S, H * S), x = c.getContext('2d');
    const ce = ML.canvas(len * E, H * E), xe = ce.getContext('2d');
    const cr = ML.canvas(len * E, H * E), xr = cr.getContext('2d');
    const W = c.width, HH = c.height;
    const dorm = b.id === 11;
    const CREAM = '#e9e6de', DARK = '#4a4f56';
    // 画到三张画布上的小工具：坐标都是米，y 从地面往上
    const R = (ctx, k, col, mx, my, mw, mh) => { ctx.fillStyle = col; ctx.fillRect(mx * k, (H - my - mh) * k, mw * k, mh * k); };
    const wall = (col, mx, my, mw, mh) => { R(x, S, col, mx, my, mw, mh); R(xr, E, 'rgb(0,215,0)', mx, my, mw, mh); R(xe, E, '#000', mx, my, mw, mh); };
    const glass = (mx, my, mw, mh, lit, cols, rows) => {
      R(x, S, glassColor(rnd), mx, my, mw, mh);
      const g = x.createLinearGradient(0, (H - my - mh) * S, 0, (H - my) * S);
      g.addColorStop(0, 'rgba(160,190,215,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
      x.fillStyle = g; x.fillRect(mx * S, (H - my - mh) * S, mw * S, mh * S);
      R(xr, E, 'rgb(0,36,205)', mx, my, mw, mh);
      if (lit) R(xe, E, lit, mx, my, mw, mh);
      for (let i = 1; i < (cols || 1); i++) R(x, S, '#8e949a', mx + mw * i / cols - 0.03, my, 0.06, mh);
      for (let i = 1; i < (rows || 1); i++) R(x, S, '#8e949a', mx, my + mh * i / rows - 0.03, mw, 0.06);
    };
    const maybeLit = p => rnd() < p ? litColor(rnd) : null;

    // 米白墙板 + 板缝
    x.fillStyle = CREAM; x.fillRect(0, 0, W, HH);
    xe.fillStyle = '#000'; xe.fillRect(0, 0, ce.width, ce.height);
    xr.fillStyle = 'rgb(0,215,0)'; xr.fillRect(0, 0, cr.width, cr.height);
    ML.speckle(x, W, HH, W * HH / 300, rnd, 0.04, 0.04, 2);
    x.strokeStyle = 'rgba(50,50,50,0.2)'; x.lineWidth = 1; x.beginPath();
    for (let m = 0; m < H; m += 1.5 + rnd() * 1.6) { x.moveTo(0, Math.round(m * S) + 0.5); x.lineTo(W, Math.round(m * S) + 0.5); }
    for (let m = 0; m < len; m += 3.6) { x.moveTo(Math.round(m * S) + 0.5, 0); x.lineTo(Math.round(m * S) + 0.5, HH); }
    x.stroke();

    const upper = !!opt.upper;                       // 屋顶上的局部加层：没有底层
    const g0 = upper ? 0 : (dorm ? floors[0] + floors[1] : floors[0]);
    const bandLo = dorm ? g0 - 1.0 : g0 - 2.3, bandHi = dorm ? g0 - 0.15 : g0 - 0.5;
    const edge = opt.long ? 3.2 : len * 0.2;         // 山墙两端留大块白板
    const top = H - 0.3;

    // 竖向深灰窗带，窗子嵌在里面，从底层腰线一直通到女儿墙
    const strips = [];
    if (dorm && opt.long) {
      const uw = 4.6, n = Math.floor((len - 1.2) / uw), off = (len - n * uw) / 2;
      for (let i = 0; i < n; i++) if (!(side === 'n' && i === (n >> 1))) strips.push([off + i * uw + 1.0, 2.6]); // 北面中间一格是楼梯间
    } else {
      const mod = 7.2;
      const n = Math.max(1, Math.floor((len - edge * 2) / mod)), off = (len - n * mod) / 2;
      for (let i = 0; i < n; i++) { const m = off + i * mod; strips.push([m + 0.7, 1.3], [m + 2.9, 1.3], [m + 4.9, 1.7]); }
    }
    strips.forEach(s => {
      wall(DARK, s[0], g0, s[1], top - g0);
      let y = 0;
      floors.forEach(fh => {
        if (y >= g0 - 0.01) {
          const wins = fh >= 6 ? [[1.0, 2.2], [fh - 2.9, 2.0]] : [[1.0, Math.min(2.3, fh - 1.7)]];
          const lit = maybeLit(dorm ? 0.4 : 0.22);
          wins.forEach(w => glass(s[0] + 0.12, y + w[0], s[1] - 0.24, w[1], lit, s[1] > 1.5 ? 2 : 1, 2));
          if (dorm && opt.long) wall('#c9c9c6', s[0] + s[1] - 0.85, y + 0.15, 0.6, 0.55); // 空调外机
        }
        y += fh;
      });
    });

    if (!upper) {
      if (dorm) {
        // 综合楼底部两层：深灰基座 + 大玻璃
        wall(DARK, 0, 0, len, g0 - 0.15);
        for (let fi = 0; fi < 2; fi++) for (let m = 1.2; m + 2.2 < len - 1; m += 2.6) glass(m, fi * floors[0] + 0.5, 2.2, floors[0] - 1.3, maybeLit(0.5), 2, 1);
      } else {
        // 底层：高窗 + 窗下深灰板，顶上一圈深灰腰线，腰线里一排小高窗
        for (let m = 1.5; m + 2.4 < len - 1.2; m += 3.6) {
          wall(DARK, m, 0.3, 2.4, 0.8);
          glass(m, 1.1, 2.4, bandLo - 2.0, maybeLit(0.25), 3, 2);
        }
        wall(DARK, 0, bandLo, len, bandHi - bandLo);
        for (let m = 2; m + 1.7 < len - 1.5; m += 2.4) glass(m, bandLo + 0.4, 1.7, 0.7, maybeLit(0.2));
      }
    }

    // 出入口：人行门是一面橙色墙，货运门是卷帘
    (b.ent || []).forEach((e, i) => {
      if (e[2] !== side || upper) return;
      const r = b.rect;
      const u = side === 's' ? e[0] - r[0] : side === 'n' ? r[2] - e[0] : side === 'e' ? r[3] - e[1] : e[1] - r[1];
      const person = dorm || i < 4 || e[3];
      const hh = dorm ? 4.0 : bandLo;
      if (person) {
        const w = e[3] ? 7 : 5.6;
        wall(ORANGE, u - w / 2, 0, w, hh);
        wall(DARK, u - 1.4, 0, 2.8, 3.3);
        glass(u - 1.2, 0.08, 2.4, 3.0, 'rgba(255,225,170,0.9)', 2, 1);
      } else {
        const w = 4.2, h = 4.8;
        wall(CREAM, u - w / 2 - 0.6, 0, w + 1.2, bandLo);
        wall(DARK, u - w / 2 - 0.12, 0, w + 0.24, h + 0.12);
        wall('#b9bcbf', u - w / 2, 0, w, h);
        x.strokeStyle = 'rgba(0,0,0,0.16)'; x.beginPath();
        for (let m = 0.22; m < h; m += 0.22) { x.moveTo((u - w / 2) * S, (H - m) * S); x.lineTo((u + w / 2) * S, (H - m) * S); }
        x.stroke();
      }
    });

    // 楼号：腰线上的白字
    if (opt.number && !upper) {
      const bh = bandHi - bandLo;
      wall(DARK, 0.8, bandLo, 4.2, bh);
      x.fillStyle = '#f1efe9'; x.font = `bold ${Math.min(1.5, bh * 0.82) * S}px "PingFang SC","Microsoft YaHei",Arial,sans-serif`;
      x.textBaseline = 'middle'; x.textAlign = 'left';
      x.fillText(b.id + '#', 1.3 * S, (H - bandLo - bh / 2) * S + 1);
    }
    // 勒脚、压顶
    wall('#55595d', 0, 0, len, 0.3);
    wall(DARK, 0, top, len, 0.3);
    const dirt = x.createLinearGradient(0, HH - 2 * S, 0, HH);
    dirt.addColorStop(0, 'rgba(70,60,45,0)'); dirt.addColorStop(1, 'rgba(70,60,45,0.1)');
    x.fillStyle = dirt; x.fillRect(0, HH - 2 * S, W, 2 * S);
    return { map: ML.tex(c), emissiveMap: ML.tex(ce), rmMap: ML.tex(cr, { srgb: false }) };
  };

  // 屋面：防水卷材的灰，带接缝和积水痕
  ML.roofTex = function () {
    const rnd = ML.rng(77), c = ML.canvas(512, 512), x = c.getContext('2d');
    x.fillStyle = '#8f9396'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26; i++) {
      x.fillStyle = `rgba(${rnd() < 0.5 ? '40,44,48' : '200,204,208'},${0.04 + rnd() * 0.06})`;
      x.beginPath(); x.ellipse(rnd() * 512, rnd() * 512, 20 + rnd() * 70, 12 + rnd() * 40, rnd() * 3, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(30,30,30,0.16)'; x.lineWidth = 1.5; x.beginPath();
    for (let m = 0; m <= 512; m += 64) { x.moveTo(m, 0); x.lineTo(m, 512); }
    x.stroke();
    ML.speckle(x, 512, 512, 5000, rnd, 0.1, 0.08, 2);
    return ML.tex(c, { repeat: [1, 1] });
  };

  /* 园区地面：一整张画出来——沥青、铺装、绿地、路缘、车位线、行车线 */
  ML.GB = { x0: -156, x1: 124, z0: -114, z1: 110 };
  ML.groundTex = function (S, driveLines) {
    const G = ML.GB, K = 14;
    const rnd = ML.rng(5);
    const c = ML.canvas((G.x1 - G.x0) * K, (G.z1 - G.z0) * K), x = c.getContext('2d');
    const W = c.width, H = c.height;
    const px = v => (v - G.x0) * K, pz = v => (v - G.z0) * K;
    const poly = pts => { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(px(p[0]), pz(p[1])) : x.moveTo(px(p[0]), pz(p[1]))); };

    // 沥青
    x.fillStyle = '#43464a'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = `rgba(${rnd() < 0.5 ? '20,20,22' : '120,122,126'},${0.03 + rnd() * 0.05})`;
      x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 30 + rnd() * 160, 20 + rnd() * 90, rnd() * 3, 0, 7); x.fill();
    }
    ML.speckle(x, W, H, 160000, rnd, 0.16, 0.1, 2.2);

    // 楼前铺装
    S.buildings.forEach(b => {
      const r = b.rect, p = 3.6;
      x.fillStyle = '#aeaba3'; x.fillRect(px(r[0] - p), pz(r[1] - p), (r[2] - r[0] + p * 2) * K, (r[3] - r[1] + p * 2) * K);
      x.strokeStyle = 'rgba(60,58,52,0.2)'; x.lineWidth = 1; x.beginPath();
      for (let m = r[0] - p; m <= r[2] + p; m += 1.2) { x.moveTo(px(m), pz(r[1] - p)); x.lineTo(px(m), pz(r[3] + p)); }
      for (let m = r[1] - p; m <= r[3] + p; m += 1.2) { x.moveTo(px(r[0] - p), pz(m)); x.lineTo(px(r[2] + p), pz(m)); }
      x.stroke();
      x.strokeStyle = '#c9c6be'; x.lineWidth = 3; x.strokeRect(px(r[0] - p), pz(r[1] - p), (r[2] - r[0] + p * 2) * K, (r[3] - r[1] + p * 2) * K);
    });

    // 绿地
    S.green.forEach(g => {
      poly(g); x.closePath();
      x.fillStyle = '#4f6a3c'; x.fill();
      x.save(); x.clip();
      const xs = g.map(p => p[0]), zs = g.map(p => p[1]);
      const bx = Math.min(...xs), bz = Math.min(...zs), bw = Math.max(...xs) - bx, bh = Math.max(...zs) - bz;
      for (let i = 0; i < bw * bh * 3; i++) {
        x.fillStyle = `rgba(${rnd() < 0.5 ? '30,60,20' : '150,185,90'},${0.1 + rnd() * 0.18})`;
        const s = 2 + rnd() * 9; x.fillRect(px(bx + rnd() * bw), pz(bz + rnd() * bh), s, s);
      }
      x.restore();
      poly(g); x.closePath(); x.strokeStyle = '#c4c1b8'; x.lineWidth = 3.5; x.stroke();
    });

    // 路缘石
    x.strokeStyle = 'rgba(196,193,184,0.9)'; x.lineWidth = 2.6; x.lineJoin = 'round';
    S.roads.forEach(r => { poly(r); x.stroke(); });

    // 行车线
    x.strokeStyle = 'rgba(236,196,52,0.9)'; x.lineWidth = 2.4; x.setLineDash([3 * K, 4 * K]);
    (driveLines || []).forEach(l => { poly(l); x.stroke(); });
    x.setLineDash([]);

    // 车位线
    x.strokeStyle = 'rgba(240,240,236,0.85)'; x.lineWidth = 1.8;
    S.bays.forEach(b => {
      x.save(); x.translate(px(b[0]), pz(b[1])); x.rotate(b[2]);
      x.strokeRect(-b[3] / 2 * K, -b[4] / 2 * K, b[3] * K, b[4] * K);
      x.restore();
    });

    // 大门口斑马线
    const zebra = (cx, cz, ang, w, l) => {
      x.save(); x.translate(px(cx), pz(cz)); x.rotate(ang); x.fillStyle = 'rgba(240,240,236,0.8)';
      for (let m = -w / 2; m < w / 2; m += 1) x.fillRect(m * K, -l / 2 * K, 0.5 * K, l * K);
      x.restore();
    };
    zebra(-58, 9, Math.PI / 2, 14, 3.2);
    zebra(-10.5, -73.5, -0.93, 9, 3);
    return ML.tex(c);
  };

  // 园区外的大地：田野绿，带一点斑驳
  ML.fieldTex = function () {
    const rnd = ML.rng(9), c = ML.canvas(1024, 1024), x = c.getContext('2d');
    x.fillStyle = '#617250'; x.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 500; i++) {
      x.fillStyle = `rgba(${['50,68,38', '120,130,80', '95,105,66', '75,90,52'][rnd() * 4 | 0]},${0.05 + rnd() * 0.1})`;
      x.beginPath(); x.ellipse(rnd() * 1024, rnd() * 1024, 10 + rnd() * 80, 8 + rnd() * 50, rnd() * 3, 0, 7); x.fill();
    }
    ML.speckle(x, 1024, 1024, 30000, rnd, 0.12, 0.08, 2.5);
    return ML.tex(c, { repeat: [60, 60] });
  };

  // 外部道路：沥青 + 中线 + 边线（沿 v 方向重复，每 12 米一格）
  ML.roadTex = function () {
    const rnd = ML.rng(21), c = ML.canvas(256, 512), x = c.getContext('2d');
    x.fillStyle = '#3f4246'; x.fillRect(0, 0, 256, 512);
    ML.speckle(x, 256, 512, 9000, rnd, 0.18, 0.1, 2);
    x.fillStyle = 'rgba(238,238,230,0.8)'; x.fillRect(10, 0, 5, 512); x.fillRect(241, 0, 5, 512);
    x.fillStyle = 'rgba(240,200,60,0.85)'; x.fillRect(125, 0, 6, 260);
    const t = ML.tex(c, { repeat: [1, 1] });
    return t;
  };

  // 栏杆：竖条，透明底
  ML.fenceTex = function () {
    const c = ML.canvas(256, 128), x = c.getContext('2d');
    x.clearRect(0, 0, 256, 128);
    x.fillStyle = '#2f3438';
    for (let m = 0; m < 256; m += 16) x.fillRect(m + 5, 6, 5, 116);
    x.fillRect(0, 10, 256, 7); x.fillRect(0, 104, 256, 7);
    return ML.tex(c);
  };

  // 路灯下的一圈光
  ML.glowTex = function () {
    const c = ML.canvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,214,150,0.95)'); g.addColorStop(0.35, 'rgba(255,200,130,0.4)'); g.addColorStop(1, 'rgba(255,190,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return ML.tex(c);
  };

  // 大门铭牌：白色大理石板，黑字
  ML.signTex = function () {
    const c = ML.canvas(2048, 512), x = c.getContext('2d'), rnd = ML.rng(3);
    x.fillStyle = '#e9e9e6'; x.fillRect(0, 0, 2048, 512);
    for (let i = 0; i < 46; i++) { // 石纹
      x.strokeStyle = `rgba(90,96,104,${0.12 + rnd() * 0.3})`; x.lineWidth = 0.6 + rnd() * 2.2; x.beginPath();
      let px = rnd() * 2048, py = 0; x.moveTo(px, py);
      while (py < 512) { px += (rnd() - 0.5) * 34; py += 14 + rnd() * 30; x.lineTo(px, py); }
      x.stroke();
    }
    x.strokeStyle = 'rgba(120,120,120,0.35)'; x.lineWidth = 2; x.beginPath();
    for (let m = 256; m < 2048; m += 256) { x.moveTo(m, 0); x.lineTo(m, 512); }
    x.stroke();
    x.fillStyle = '#17181a'; x.textBaseline = 'middle'; x.textAlign = 'center';
    x.font = 'bold 100px "PingFang SC","Microsoft YaHei",sans-serif'; x.fillText('梅李镇特色产业发展中心（智谷共享空间）', 1024, 215);
    x.font = 'bold 50px "Helvetica Neue",Arial,sans-serif'; x.fillText('MEILI TOWN DISTINCTIVE INDUSTRY DEVELOPMENT CENTER', 1024, 345);
    return ML.tex(c);
  };
})(window.ML);
