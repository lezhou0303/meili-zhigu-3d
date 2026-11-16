'use strict';
/* 园区本体：地面、11 栋楼、屋顶设备、围墙大门、路灯、车辆、绿化 */
(function (ML) {
  const S = window.SITE;
  const ORANGE = 0xe2702a;

  // 园内行车线（x, z），也用来排路灯
  ML.DRIVE = [
    { closed: true, pts: [[-35, 11], [37.7, 11], [37.7, 94], [-35, 94]] },
    { closed: false, pts: [[-66, 9], [-35, 11]] },
    { closed: false, pts: [[37.7, 11], [37.7, -31.5], [71, -31.5], [71, -70], [3, -70], [-9, -77]] },
    { closed: false, pts: [[37.7, 11], [108, 11]] },
    { closed: false, pts: [[-35, 56], [-134, 56], [-134, 20.5], [-35, 20.5]] }
  ];

  const std = o => new THREE.MeshStandardMaterial(o);
  function box(w, h, d, mat, x, y, z, parent, shadow) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    parent.add(m); return m;
  }

  ML.buildCampus = function (scene, trees, env) {
    const rnd = ML.rng(11);
    const g = new THREE.Group(); scene.add(g);
    ML.pick = [];           // 可点选的楼体
    ML.places = { buildings: {}, gates: { main: [-66, 9], north: [-11, -78] } };
    const facadeMats = [];
    const inBuilding = (x, z, pad) => S.buildings.some(b => ML.inRect(x, z, b.rect, pad));

    /* ---- 地面 ---- */
    const shape = new THREE.Shape(S.boundary.map(p => new THREE.Vector2(p[0], -p[1])));
    const gg = new THREE.ShapeGeometry(shape); gg.rotateX(-Math.PI / 2);
    const gp = gg.attributes.position, guv = gg.attributes.uv, G = ML.GB;
    for (let i = 0; i < gp.count; i++) guv.setXY(i, (gp.getX(i) - G.x0) / (G.x1 - G.x0), 1 - (gp.getZ(i) - G.z0) / (G.z1 - G.z0));
    const ground = new THREE.Mesh(gg, std({ map: ML.groundTex(S, ML.DRIVE.map(d => d.closed ? d.pts.concat([d.pts[0]]) : d.pts)), roughness: 0.93 }));
    ground.position.y = 0.03; ground.receiveShadow = true; g.add(ground);
    ML.ground = ground;

    /* ---- 楼 ---- */
    const roofMap = ML.roofTex();
    const wallMat = std({ color: 0xdedcd5, roughness: 0.9 });
    const copingMat = std({ color: 0x6a6e72, roughness: 0.7 });
    const orangeMat = std({ color: ORANGE, roughness: 0.55 });
    const darkMat = std({ color: 0x4a4f56, roughness: 0.7 });
    const slabMat = std({ color: 0xd6d3ca, roughness: 0.9 });
    const acList = [], pvList = [];
    const glassMat = std({ color: 0x2c3a46, roughness: 0.12, metalness: 0.85, emissive: 0xffdca8, emissiveIntensity: 0 });
    facadeMats.push(glassMat);

    function facadeMat(b, side, len, H, floors, opt) {
      const t = ML.facade(b, side, len, H, floors, opt);
      const m = std({ map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughnessMap: t.rmMap, metalnessMap: t.rmMap, roughness: 1, metalness: 1 });
      facadeMats.push(m); return m;
    }
    function roofPlane(w, d, x, y, z) {
      const pg = new THREE.PlaneGeometry(w, d); pg.rotateX(-Math.PI / 2);
      const uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 26, uv.getY(i) * d / 26);
      const m = new THREE.Mesh(pg, std({ map: roofMap, roughness: 0.95 })); m.position.set(x, y, z); m.receiveShadow = true; g.add(m);
    }
    function block(b, rect, y0, H, floors, opt) {
      const w = rect[2] - rect[0], d = rect[3] - rect[1], cx = (rect[0] + rect[2]) / 2, cz = (rect[1] + rect[3]) / 2;
      const longX = w >= d;
      const isLong = side => longX ? (side === 's' || side === 'n') : (side === 'e' || side === 'w');
      const o = side => Object.assign({ number: opt.number && (b.id === 11 ? !isLong(side) : isLong(side)), long: longX ? (side === 's' || side === 'n') : (side === 'e' || side === 'w') }, opt);
      const bb = Object.assign({}, b, { ent: opt.noEnt ? [] : b.ent });
      const mats = [facadeMat(bb, 'e', d, H, floors, o('e')), facadeMat(bb, 'w', d, H, floors, o('w')), copingMat, copingMat,
        facadeMat(bb, 's', w, H, floors, o('s')), facadeMat(bb, 'n', w, H, floors, o('n'))];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), mats);
      mesh.position.set(cx, y0 + H / 2, cz); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.b = b; g.add(mesh);
      ML.pick.push(mesh);
      // 女儿墙 + 屋面
      const ph = 1.0, t = 0.3, top = y0 + H;
      box(w, ph, t, wallMat, cx, top + ph / 2, rect[1] + t / 2, g); box(w, ph, t, wallMat, cx, top + ph / 2, rect[3] - t / 2, g);
      box(t, ph, d - t * 2, wallMat, rect[0] + t / 2, top + ph / 2, cz, g); box(t, ph, d - t * 2, wallMat, rect[2] - t / 2, top + ph / 2, cz, g);
      [[w + 0.1, 0.08, t + 0.1, cx, rect[1] + t / 2], [w + 0.1, 0.08, t + 0.1, cx, rect[3] - t / 2], [t + 0.1, 0.08, d, rect[0] + t / 2, cz], [t + 0.1, 0.08, d, rect[2] - t / 2, cz]]
        .forEach(c => box(c[0], c[1], c[2], copingMat, c[3], top + ph + 0.04, c[4], g, false));
      roofPlane(w - t * 2, d - t * 2, cx, top + 0.02, cz);
      return mesh;
    }

    S.buildings.forEach(b => {
      const r = b.rect;
      let floors = b.floors, H = b.h, phs = b.ph.filter(p => p[2] - p[0] > 2 && p[3] - p[1] > 2), upper = null;
      if (b.id === 4 || b.id === 6) { floors = [9.5, 8.05]; H = 17.55; upper = phs[0]; phs = phs.slice(1); } // 两层主体 + 局部三层
      const main = block(b, r, 0, H, floors, { number: true });
      let roofTop = H;
      const blocked = phs.map(p => p.slice());
      if (upper) { block(b, upper, H, 4.5, [4.5], { noEnt: true, seed: 9, upper: true }); blocked.push(upper); }
      // 屋顶机房
      phs.forEach((p, i) => {
        const w = p[2] - p[0], d = p[3] - p[1];
        box(w, b.top, d, darkMat, (p[0] + p[2]) / 2, H + b.top / 2, (p[1] + p[3]) / 2, g);
        box(w + 0.3, 0.15, d + 0.3, copingMat, (p[0] + p[2]) / 2, H + b.top + 0.07, (p[1] + p[3]) / 2, g, false);
      });
      // 屋顶设备：空调外机成排，部分厂房铺光伏
      const pv = [1, 5, 7, 10, 2, 3].indexOf(b.id) >= 0;
      const free = (x, z, pad) => x > r[0] + 2 && x < r[2] - 2 && z > r[1] + 2 && z < r[3] - 2 && !blocked.some(p => ML.inRect(x, z, p, pad));
      if (pv) {
        for (let x = r[0] + 3.5; x < r[2] - 3; x += 2.25) for (let z = r[1] + 3.5; z < r[3] - 3; z += 3.4) {
          const gapX = ((x - r[0]) % 20) > 17.5, gapZ = ((z - r[1]) % 24) > 20.5;
          if (!gapX && !gapZ && free(x, z, 2.5)) pvList.push([x, roofTop + 0.55, z]);
        }
      } else {
        const rows = 2 + (rnd() * 3 | 0);
        for (let k = 0; k < rows; k++) {
          const along = (r[2] - r[0]) >= (r[3] - r[1]);
          const x0 = r[0] + 5 + rnd() * Math.max(1, r[2] - r[0] - 22), z0 = r[1] + 5 + rnd() * Math.max(1, r[3] - r[1] - 22);
          const n = 4 + (rnd() * 6 | 0);
          for (let i = 0; i < n; i++) { const x = x0 + (along ? i * 3 : 0), z = z0 + (along ? 0 : i * 3); if (free(x, z, 1.5)) acList.push([x, roofTop + 0.75, z, along ? 0 : 1.57]); }
        }
      }
      // 底层腰线挑出的一圈檐口
      if (b.id !== 11) {
        const yb = b.floors[0] - 0.5, w = r[2] - r[0], d = r[3] - r[1], cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2, t = 0.55;
        box(w + t * 2, 0.3, t, darkMat, cx, yb, r[1] - t / 2, g); box(w + t * 2, 0.3, t, darkMat, cx, yb, r[3] + t / 2, g);
        box(t, 0.3, d, darkMat, r[0] - t / 2, yb, cz, g); box(t, 0.3, d, darkMat, r[2] + t / 2, yb, cz, g);
      }
      // 入口雨棚
      const entPts = [];
      b.ent.forEach((e, i) => {
        const person = b.id === 11 || i < 4 || e[3];
        const nx = e[2] === 'e' ? 1 : e[2] === 'w' ? -1 : 0, nz = e[2] === 's' ? 1 : e[2] === 'n' ? -1 : 0;
        entPts.push({ x: e[0] + nx * 2.5, z: e[1] + nz * 2.5, person });
        const w = person ? (e[3] ? 7 : 5.6) : 4.8, cy = person ? 3.6 : 5.1, dp = person ? 2.2 : 1.6; // 灰色雨棚
        box(nx ? dp : w, 0.25, nx ? w : dp, darkMat, e[0] + nx * dp / 2, cy, e[1] + nz * dp / 2, g);
        if (!person) return;
        ML.entGlow.push([e[0] + nx * 3, e[1] + nz * 3, 11]);
      });
      // 11 号楼：山墙上的橙色凸窗框、南侧入口雨棚
      if (b.id === 11) {
        [[10.2, -84], [17.4, -84], [13.8, -92]].forEach(o => {
          [r[0] - 0.35, r[2] + 0.35].forEach(x => { box(0.7, 3.0, 3.2, orangeMat, x, o[0], o[1], g); box(0.75, 1.9, 2.1, glassMat, x, o[0], o[1], g, false); });
        });
        box(1.0, 4.3, 1.0, darkMat, 31, 2.15, r[3] + 2.6, g); box(1.0, 4.3, 1.0, darkMat, 42.6, 2.15, r[3] + 2.6, g);
        box(13.6, 0.4, 3.6, darkMat, 36.8, 4.4, r[3] + 1.8, g);
      }
      ML.places.buildings[b.id] = { center: [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], height: H, entrances: entPts, loop: [[r[0] - 2.2, r[1] - 2.2], [r[2] + 2.2, r[1] - 2.2], [r[2] + 2.2, r[3] + 2.2], [r[0] - 2.2, r[3] + 2.2]] };
      main.userData.top = H + (b.top || 0);
    });

    // 屋顶设备实例
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), One = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const ac = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1.4, 1.5), std({ color: 0xc9ccce, roughness: 0.6, metalness: 0.3 }), acList.length);
    acList.forEach((a, i) => { E.set(0, a[3], 0); Q.setFromEuler(E); M.compose(V.set(a[0], a[1], a[2]), Q, One); ac.setMatrixAt(i, M); });
    ac.castShadow = true; ac.receiveShadow = true; g.add(ac);
    const pvm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, 0.06, 3.1), std({ color: 0x1c2f55, roughness: 0.25, metalness: 0.7 }), pvList.length);
    E.set(0.2, 0, 0); Q.setFromEuler(E);
    pvList.forEach((a, i) => { M.compose(V.set(a[0], a[1], a[2]), Q, One); pvm.setMatrixAt(i, M); });
    pvm.castShadow = true; g.add(pvm);

    /* ---- 变配电、门卫 ---- */
    const sr = S.substation.rect;
    box(sr[2] - sr[0], 4.5, sr[3] - sr[1], std({ color: 0xcfd2d0, roughness: 0.85 }), (sr[0] + sr[2]) / 2, 2.25, (sr[1] + sr[3]) / 2, g);
    box(sr[2] - sr[0] - 2, 1.4, sr[3] - sr[1] + 0.1, std({ color: 0x5b6166, roughness: 0.6 }), (sr[0] + sr[2]) / 2, 2.6, (sr[1] + sr[3]) / 2, g, false);
    box(sr[2] - sr[0] + 0.6, 0.25, sr[3] - sr[1] + 0.6, copingMat, (sr[0] + sr[2]) / 2, 4.6, (sr[1] + sr[3]) / 2, g);
    function gatehouse(x, z, ry) {
      const h = new THREE.Group(); h.position.set(x, 0, z); h.rotation.y = ry; g.add(h);
      box(5.8, 3.3, 4.4, darkMat, 0, 1.65, 0, h); box(5.9, 1.3, 4.5, glassMat, 0, 1.9, 0, h, false);
      box(8.6, 0.35, 7, std({ color: 0xf0efea, roughness: 0.6 }), 0, 3.5, 0, h);
    }
    gatehouse(-63.8, 20, 0); gatehouse(-5.9, -81.2, 0.95);

    /* ---- 大门：铭牌墙、道闸 ---- */
    const signG = new THREE.Group(); signG.position.set(-66.2, 0, -2.4); signG.rotation.y = Math.PI / 2 - 0.12; g.add(signG);
    const granite = std({ color: 0x3f4245, roughness: 0.75 });
    box(12.4, 3.9, 0.7, granite, 0, 1.95, 0, signG);
    const marble = std({ map: ML.signTex(), roughness: 0.35 }), side = std({ color: 0xe6e6e3, roughness: 0.4 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(10.6, 2.65, 0.16), [side, side, side, side, side, marble]);
    panel.position.set(-0.4, 2.25, -0.43); panel.castShadow = true; signG.add(panel);
    const stripe = ML.canvas(256, 16), sx = stripe.getContext('2d');
    for (let i = 0; i < 8; i++) { sx.fillStyle = i % 2 ? '#f2f2f0' : '#d43a2c'; sx.fillRect(i * 32, 0, 32, 16); }
    const armMat = std({ map: ML.tex(stripe), roughness: 0.6 });
    function barrier(x, z, ry, len) {
      const h = new THREE.Group(); h.position.set(x, 0, z); h.rotation.y = ry; g.add(h);
      box(0.45, 1.1, 0.45, std({ color: 0xe8e6e0, roughness: 0.6 }), 0, 0.55, 0, h);
      box(len, 0.12, 0.1, armMat, len / 2, 1.0, 0, h);
    }
    barrier(-63.5, 5.2, -Math.PI / 2, 5.4); barrier(-63.5, 16.6, Math.PI / 2, 5.4);
    box(1.2, 0.25, 3, std({ color: 0xc4c1b8, roughness: 0.9 }), -63.5, 0.12, 10.9, g);
    barrier(-13.6, -73.2, -2.2, 6);

    /* ---- 围墙栏杆 ---- */
    const runs = S.walls.map(w => w).concat([S.boundary.slice(6, 36)]);
    const panels = [], posts = [];
    runs.forEach(run => {
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i], b = run[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.round(L / 3)), ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          panels.push([ML.lerp(a[0], b[0], (t0 + t1) / 2), ML.lerp(a[1], b[1], (t0 + t1) / 2), ang, L / n]);
          posts.push([ML.lerp(a[0], b[0], t0), ML.lerp(a[1], b[1], t0)]);
        }
      }
      posts.push(run[run.length - 1]);
    });
    const fm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1.75), std({ map: ML.fenceTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }), panels.length);
    const fb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.4, 0.3), std({ color: 0xa9a69e, roughness: 0.95 }), panels.length);
    panels.forEach((p, i) => {
      E.set(0, p[2], 0); Q.setFromEuler(E);
      M.compose(V.set(p[0], 1.25, p[1]), Q, new THREE.Vector3(p[3], 1, 1)); fm.setMatrixAt(i, M);
      M.compose(V.set(p[0], 0.2, p[1]), Q, new THREE.Vector3(p[3], 1, 1)); fb.setMatrixAt(i, M);
    });
    const fp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 2.3, 0.28), std({ color: 0xb5b2aa, roughness: 0.9 }), posts.length);
    Q.identity(); posts.forEach((p, i) => { M.compose(V.set(p[0], 1.15, p[1]), Q, One); fp.setMatrixAt(i, M); });
    fb.castShadow = fp.castShadow = true; fb.receiveShadow = true; g.add(fm, fb, fp);

    /* ---- 绿化 ---- */
    S.green.forEach(poly => {
      const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
      const x0 = Math.min(...xs), z0 = Math.min(...zs), w = Math.max(...xs) - x0, d = Math.max(...zs) - z0;
      const n = Math.ceil(w * d / 38);
      for (let i = 0; i < n * 2.2; i++) {
        const x = x0 + rnd() * w, z = z0 + rnd() * d;
        if (!ML.inPoly(x, z, poly) || inBuilding(x, z, 3.5)) continue;
        if (i < n) trees.add(x, z, 1.1 + rnd() * 0.9); else trees.add(x, z, 0.45 + rnd() * 0.5, 1);
      }
    });
    // 沿围墙内侧的一排树（东、南两侧）
    const edge = S.boundary.slice(6, 36);
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i], b = edge[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 4; t < L; t += 9) {
        const x = ML.lerp(a[0], b[0], t / L), z = ML.lerp(a[1], b[1], t / L);
        const ix = x + (-15 - x) / Math.hypot(-15 - x, -z) * 2.6, iz = z + (0 - z) / Math.hypot(-15 - x, -z) * 2.6;
        if (!inBuilding(ix, iz, 3) && !S.bays.some(p => Math.hypot(p[0] - ix, p[1] - iz) < 3.6)) trees.add(ix, iz, 1 + rnd() * 0.5);
      }
    }

    /* ---- 路灯 ---- */
    const lamps = [];
    ML.DRIVE.forEach(d => {
      const p = new ML.Path(d.pts, d.closed, 0.05);
      for (let s = 8; s < p.length; s += 30) {
        const o = p.at(s, {}), x = o.x - o.tz * 5.2, z = o.z + o.tx * 5.2;
        if (!inBuilding(x, z, 1.5) && ML.inPoly(x, z, S.boundary)) lamps.push([x, z, Math.atan2(-o.tx, -o.tz) + Math.PI / 2, o]);
      }
    });
    const pole = new THREE.CylinderGeometry(0.07, 0.11, 8, 8); pole.translate(0, 4, 0);
    const armG = new THREE.BoxGeometry(2.2, 0.1, 0.12); armG.translate(-1.0, 7.95, 0);
    const lp = new THREE.InstancedMesh(ML.merge([pole, armG]), std({ color: 0xeeeeec, roughness: 0.5, metalness: 0.2 }), lamps.length);
    const baseG = new THREE.CylinderGeometry(0.125, 0.13, 1.3, 8); baseG.translate(0, 0.65, 0);
    const lb = new THREE.InstancedMesh(baseG, std({ color: 0x1f3fa8, roughness: 0.5 }), lamps.length);
    const headMat = std({ color: 0xdddddd, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
    const hg = new THREE.BoxGeometry(0.9, 0.1, 0.34); hg.translate(-1.9, 7.86, 0);
    const lh = new THREE.InstancedMesh(hg, headMat, lamps.length);
    const glowList = [];
    lamps.forEach((l, i) => {
      const ry = Math.atan2(-l[3].tx, -l[3].tz); // 灯臂伸向路中
      E.set(0, ry, 0); Q.setFromEuler(E);
      M.compose(V.set(l[0], 0, l[1]), Q, One); lp.setMatrixAt(i, M); lh.setMatrixAt(i, M); lb.setMatrixAt(i, M);
      glowList.push([l[0] + l[3].tz * 1.9, l[1] - l[3].tx * 1.9, 20]);
    });
    lp.castShadow = true; g.add(lp, lh, lb);
    // 灯下光斑、入口暖光
    ML.entGlow.forEach(e => glowList.push(e));
    S.buildings.forEach(b => { // 外墙壁灯
      const r = b.rect;
      for (let x = r[0] + 6; x < r[2] - 3; x += 15) { glowList.push([x, r[1] - 2.2, 10]); glowList.push([x, r[3] + 2.2, 10]); }
      for (let z = r[1] + 6; z < r[3] - 3; z += 15) { glowList.push([r[0] - 2.2, z, 10]); glowList.push([r[2] + 2.2, z, 10]); }
    });
    const glowMat = new THREE.MeshBasicMaterial({ map: ML.glowTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const gq = new THREE.PlaneGeometry(1, 1); gq.rotateX(-Math.PI / 2);
    const glow = new THREE.InstancedMesh(gq, glowMat, glowList.length);
    Q.identity(); glowList.forEach((p, i) => { M.compose(V.set(p[0], 0.1 + i * 0.0004, p[1]), Q, new THREE.Vector3(p[2], 1, p[2])); glow.setMatrixAt(i, M); });
    glow.renderOrder = 5; g.add(glow);

    /* ---- 车 ---- */
    const car = ML.carGeo();
    const paints = [0xf2f2f0, 0xf2f2f0, 0xd9dcdf, 0x1d1f22, 0x1d1f22, 0x5d646b, 0x9aa1a8, 0x27406e, 0x8c1f1f, 0xb9b3a6];
    const parked = S.bays.filter((b, i) => ML.rng(i * 7 + 3)() < 0.5);
    const bodyMat = std({ roughness: 0.32, metalness: 0.55 });
    const cabinMat = std({ color: 0x151a20, roughness: 0.08, metalness: 0.9 });
    const wheelMat = std({ color: 0x18191b, roughness: 0.85 });
    const cb = new THREE.InstancedMesh(car.body, bodyMat, parked.length), cc = new THREE.InstancedMesh(car.cabin, cabinMat, parked.length), cw = new THREE.InstancedMesh(car.wheels, wheelMat, parked.length);
    parked.forEach((b, i) => {
      E.set(0, -b[2] + (rnd() < 0.5 ? Math.PI : 0), 0); Q.setFromEuler(E);
      const s = 0.94 + rnd() * 0.1;
      M.compose(V.set(b[0] + (rnd() - 0.5) * 0.2, 0.03, b[1] + (rnd() - 0.5) * 0.2), Q, new THREE.Vector3(s, s, s));
      cb.setMatrixAt(i, M); cc.setMatrixAt(i, M); cw.setMatrixAt(i, M);
      cb.setColorAt(i, col.set(paints[rnd() * paints.length | 0]));
    });
    cb.castShadow = cc.castShadow = true; cb.receiveShadow = true; g.add(cb, cc, cw);

    // 行驶中的车
    ML.movers = [];
    const tailMat = std({ color: 0x551111, emissive: 0xff2a1a, emissiveIntensity: 0 });
    const headLightMat = std({ color: 0xeeeeee, emissive: 0xfff2cc, emissiveIntensity: 0 });
    function mover(path, start, speed, lane, dir) {
      const c = new THREE.Group();
      const b = new THREE.Mesh(car.body, std({ color: paints[rnd() * paints.length | 0], roughness: 0.32, metalness: 0.55 }));
      b.castShadow = true; c.add(b, new THREE.Mesh(car.cabin, cabinMat), new THREE.Mesh(car.wheels, wheelMat));
      [-0.6, 0.6].forEach(z => { box(0.08, 0.14, 0.34, headLightMat, 2.2, 0.66, z, c, false); box(0.08, 0.12, 0.34, tailMat, -2.2, 0.72, z, c, false); });
      g.add(c);
      ML.movers.push({ obj: c, path, d: start, speed, lane, dir });
    }
    const loopA = new ML.Path(ML.DRIVE[0].pts, true, 0.06);
    const loopB = new ML.Path(ML.DRIVE[2].pts.slice().reverse().concat([[37.7, 11], [-35, 11], [-66, 9]]), false, 0.06);
    mover(loopA, 20, 4.5, 1.7, 1); mover(loopA, 190, 4, 1.7, 1);
    mover(loopB, 60, 4.5, 1.7, 1);
    ML.extRoads.forEach((p, i) => { for (let k = 0; k < 4; k++) mover(p, rnd() * p.length, 10 + rnd() * 5, 2.1, k % 2 ? 1 : -1); });

    // 天黑亮灯
    env.onLights.push(v => {
      facadeMats.forEach(m => m.emissiveIntensity = v * 1.5);
      headMat.emissiveIntensity = v * 5; glowMat.opacity = v * 0.95;
      tailMat.emissiveIntensity = v * 3; headLightMat.emissiveIntensity = v * 6;
    });
  };
  ML.entGlow = [];

  const P = {};
  ML.updateMovers = function (dt) {
    ML.movers.forEach(m => {
      m.d += m.speed * dt * m.dir;
      const p = m.path;
      if (!p.closed) { if (m.d > p.length) m.d -= p.length; if (m.d < 0) m.d += p.length; }
      p.at(m.d, P);
      const tx = P.tx * m.dir, tz = P.tz * m.dir;
      m.obj.position.set(P.x - tz * m.lane, 0.04, P.z + tx * m.lane);
      m.obj.rotation.y = Math.atan2(-tz, tx);
    });
  };

  // 小轿车：车身侧面轮廓拉伸 + 深色座舱 + 四个轮子。车头朝 +x
  ML.carGeo = function () {
    const ex = (pts, depth) => {
      const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
      const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
      g.translate(0, 0, -depth / 2); return g;
    };
    const body = ML.merge([ex([[-2.2, 0.32], [2.15, 0.32], [2.22, 0.62], [2.0, 0.8], [1.15, 0.9], [-2.05, 0.94], [-2.22, 0.7]], 1.66),
      (() => { const r = new THREE.BoxGeometry(1.55, 0.06, 1.5); r.translate(-0.42, 1.44, 0); return r; })()]);
    const cabin = ex([[-1.72, 0.92], [-1.28, 1.42], [0.42, 1.42], [1.18, 0.9]], 1.52);
    const wheels = ML.merge([[1.38, 0.86], [1.38, -0.86], [-1.32, 0.86], [-1.32, -0.86]].map(p => {
      const w = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14); w.rotateX(Math.PI / 2); w.translate(p[0], 0.33, p[1]); return w;
    }));
    return { body, cabin, wheels };
  };
})(window.ML);
