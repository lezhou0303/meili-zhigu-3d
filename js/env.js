'use strict';
/* 天空、光照、时间，以及园区外的环境：田野、河、道路、树 */
(function (ML) {
  const C = h => new THREE.Color(h);
  const DEG = Math.PI / 180;
  const sstep = (a, b, v) => ML.smooth(ML.clamp((v - a) / (b - a), 0, 1));

  /* ---------- 天空 ---------- */
  const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const SKY_FS = `
    varying vec3 vDir;
    uniform vec3 top, horizon, sunDir, sunColor, cloudLit, cloudShade;
    uniform float time, cover, stars, sunGlow;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec2(17.0,9.0); a*=0.5; } return v; }
    void main(){
      vec3 d = normalize(vDir);
      float h = max(d.y, 0.0);
      vec3 col = mix(horizon, top, pow(h, 0.42));
      float s = max(dot(d, sunDir), 0.0);
      col += sunColor * (pow(s, 6.0) * 0.22 * sunGlow * (1.0 - h * 0.6));
      col += sunColor * min(pow(s, 900.0) * 14.0, 6.0);
      if (stars > 0.01 && d.y > 0.0) {
        vec2 sp = d.xz / (d.y + 0.4) * 180.0;
        float st = step(0.9975, hash(floor(sp)));
        col += vec3(0.8,0.85,1.0) * st * stars * smoothstep(0.02, 0.3, d.y);
      }
      if (d.y > 0.01) {
        vec2 p = d.xz / (d.y + 0.18) * 1.25 + vec2(time * 0.006, time * 0.002);
        float n = fbm(p);
        float c = smoothstep(cover, cover + 0.32, n);
        float thick = smoothstep(cover + 0.1, cover + 0.6, n);
        vec3 cc = mix(cloudLit, cloudShade, thick * 0.75);
        cc += sunColor * pow(s, 4.0) * 0.12;
        col = mix(col, cc, c * smoothstep(0.01, 0.16, d.y) * 0.92);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  ML.buildSky = function (scene, renderer) {
    const U = {
      top: { value: C('#2c6ccb') }, horizon: { value: C('#bcd8ee') }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: C('#fff1dc') }, cloudLit: { value: C('#ffffff') }, cloudShade: { value: C('#9aa7b8') },
      time: { value: 0 }, cover: { value: 0.5 }, stars: { value: 0 }, sunGlow: { value: 1 }
    };
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
    const geo = new THREE.SphereGeometry(4500, 48, 24);
    const sky = new THREE.Mesh(geo, mat); sky.frustumCulled = false; sky.renderOrder = -10;
    scene.add(sky);
    // 环境反射：单独渲染一份天空
    const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(geo, mat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera; sc.left = -200; sc.right = 200; sc.top = 170; sc.bottom = -170; sc.near = 50; sc.far = 900;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
    scene.add(sun); scene.add(sun.target);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 0.3);
    scene.add(hemi);
    scene.fog = new THREE.FogExp2(0xc3d7e8, 0.0009);

    const K = {
      top: [C('#0a1226'), C('#4f84c4'), C('#4a5a8c')], hor: [C('#1b2842'), C('#cfdde8'), C('#f4a56a')],
      fog: [C('#0d1524'), C('#c3d7e8'), C('#d6a688')], sun: [C('#8ea6d6'), C('#fff1dc'), C('#ff9a55')],
      cl: [C('#1c2536'), C('#ffffff'), C('#ffc79c')], cs: [C('#0b101c'), C('#93a2b6'), C('#6d6078')],
      gnd: [C('#10151d'), C('#8a8578'), C('#6e594a')]
    };
    const mix3 = (out, k, d, dusk) => out.copy(k[0]).lerp(k[1], d).lerp(k[2], dusk);
    const tmp = new THREE.Color();

    const env = { sky, sun, hemi, hour: 12, lights: 0, onLights: [] };
    env.setHour = function (h) {
      env.hour = h;
      const a = Math.PI * (h - 6) / 12;
      const el = Math.sin(a) * 58 * DEG;                       // 太阳高度角
      const day = sstep(-4 * DEG, 14 * DEG, el);
      const dusk = ML.clamp(1 - Math.abs(el - 3 * DEG) / (15 * DEG), 0, 1) * 0.72;
      const night = 1 - sstep(-9 * DEG, 1 * DEG, el);
      const sunDir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(Math.max(a, 0.001)) * 0.75 * Math.cos(el) + 0.25).normalize();
      const moonDir = new THREE.Vector3(-0.45, 0.72, -0.5).normalize();
      const useSun = el > -2 * DEG;
      const dir = useSun ? sunDir : moonDir;
      mix3(U.top.value, K.top, day, dusk); mix3(U.horizon.value, K.hor, day, dusk);
      mix3(U.cloudLit.value, K.cl, day, dusk); mix3(U.cloudShade.value, K.cs, day, dusk);
      mix3(U.sunColor.value, K.sun, day, dusk);
      U.sunDir.value.copy(dir); U.stars.value = night; U.sunGlow.value = useSun ? 1 + dusk * 3 : 0.4;
      mix3(scene.fog.color, K.fog, day, dusk);
      scene.fog.density = ML.lerp(0.0011, 0.00085, day) + dusk * 0.0003;
      sun.color.copy(U.sunColor.value);
      sun.intensity = useSun ? 3.3 * sstep(-2 * DEG, 16 * DEG, el) + 0.05 : 0.7 * night;
      sun.position.copy(dir).multiplyScalar(450).add(new THREE.Vector3(-15, 0, 0));
      sun.target.position.set(-15, 0, 0);
      hemi.color.copy(U.top.value).lerp(U.horizon.value, 0.75);
      mix3(hemi.groundColor, K.gnd, day, dusk);
      hemi.intensity = ML.lerp(0.9, 1.0, day) - dusk * 0.3;
      renderer.toneMappingExposure = ML.lerp(1.5, 0.82, day) + dusk * 0.08;
      scene.environmentIntensity = ML.lerp(1.6, 0.65, day);
      env.lights = 1 - sstep(1 * DEG, 9 * DEG, el);
      env.onLights.forEach(f => f(env.lights));
      // 重新烘焙环境反射
      sky.position.set(0, 0, 0);
      const rt = pmrem.fromScene(envScene, 0, 1, 6000);
      scene.environment = rt.texture;
      if (envRT) envRT.dispose();
      envRT = rt;
    };
    env.tick = function (t, cam) { U.time.value = t; sky.position.copy(cam.position); };
    return env;
  };

  /* ---------- 树：全场共用一套实例 ---------- */
  ML.Trees = function () { this.list = []; };
  ML.Trees.prototype.add = function (x, z, s, kind) {
    if (Math.hypot(x + 70, z + 2) < 13) return; // 大门铭牌前不种树
    this.list.push([x, z, s, kind || 0]);
  };
  ML.Trees.prototype.build = function (scene) {
    const rnd = ML.rng(404);
    // 树冠：几团挤在一起的球，顶点抖一抖
    const blobs = [[0, 0, 0, 1], [0.55, -0.25, 0.3, 0.72], [-0.5, -0.2, -0.35, 0.75], [0.1, 0.5, -0.2, 0.66], [-0.15, -0.1, 0.6, 0.6]];
    const parts = blobs.map(b => {
      const g = new THREE.IcosahedronGeometry(b[3], 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + (Math.sin(p.getX(i) * 9.1) * Math.cos(p.getY(i) * 7.3) * Math.sin(p.getZ(i) * 8.7)) * 0.16;
        p.setXYZ(i, p.getX(i) * k + b[0], p.getY(i) * k * 0.88 + b[1], p.getZ(i) * k + b[2]);
      }
      return g;
    });
    const crown = ML.merge(parts);
    const cp = crown.attributes.position, col = new Float32Array(cp.count * 3);
    for (let i = 0; i < cp.count; i++) { const hsh = Math.sin(cp.getX(i) * 12.9 + cp.getY(i) * 78.2 + cp.getZ(i) * 37.7) * 0.5;
      const v = ML.clamp(0.5 + cp.getY(i) * 0.4 + hsh * 0.1, 0.25, 1); col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v; }
    crown.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const trunk = new THREE.CylinderGeometry(0.09, 0.14, 1, 6); trunk.translate(0, 0.5, 0);
    const n = this.list.length;
    const mc = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), n);
    const mt = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    this.list.forEach((t, i) => {
      const s = t[2], shrub = t[3] === 1;
      const th = shrub ? 0.15 : s * (1.3 + rnd() * 0.5);
      e.set(0, rnd() * 6.28, 0); q.setFromEuler(e);
      const r = s * (shrub ? 1 : 1.55 + rnd() * 0.35);
      m.compose(new THREE.Vector3(t[0], th + r * 0.62, t[1]), q, new THREE.Vector3(r, r * (shrub ? 0.7 : 0.95 + rnd() * 0.25), r));
      mc.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t[0], 0, t[1]), q, new THREE.Vector3(s * 1.6, th + r * 0.3, s * 1.6));
      mt.setMatrixAt(i, m);
      c.setHSL(0.24 + rnd() * 0.08, 0.3 + rnd() * 0.16, 0.2 + rnd() * 0.1);
      mc.setColorAt(i, c);
    });
    mc.castShadow = true; mc.receiveShadow = true; mt.castShadow = true;
    scene.add(mc, mt);
  };

  /* ---------- 园区外 ---------- */
  ML.buildSurroundings = function (scene, trees, env) {
    const rnd = ML.rng(2024);
    const S = window.SITE;
    const g = new THREE.Group(); scene.add(g);
    // 外部道路中心线
    const R1 = [[-198, -300], [-176, -110], [-159, 22], [-148.5, 92], [-128, 232], [-98, 430]];          // 西侧南北向道路，过河
    const R2 = [[-159, 10.6], [-110, 10.8], [-80, 9.5], [-71, -4], [-62, -19], [-38, -53], [-13, -88], [4, -113], [70, -205], [150, -315]]; // 门前路
    const p1 = new ML.Path(R1, false, 0.3), p2 = new ML.Path(R2, false, 0.3);
    ML.extRoads = [p1, p2];
    const distToPath = (x, z, p) => { let m = 1e9; for (let i = 0; i < p.pts.length; i += 2) { const d = Math.hypot(p.pts[i].x - x, p.pts[i].z - z); if (d < m) m = d; } return m; };
    const nearRoad = (x, z, d) => distToPath(x, z, p1) < d || distToPath(x, z, p2) < d;
    const inSite = (x, z, pad) => x > -150 - pad && x < 120 + pad && z > -110 - pad && z < 106 + pad && (ML.inPoly(x, z, S.boundary) || pad > 0 && ML.inPoly(x + pad * 0.6, z + pad * 0.6, S.boundary) || pad > 0 && ML.inPoly(x - pad * 0.3, z + pad * 0.5, S.boundary));
    const RIVER = [109, 141];
    const inRiver = (z, pad) => z > RIVER[0] - pad && z < RIVER[1] + pad;

    // 大地
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ map: ML.fieldTex(), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; g.add(ground);

    // 田块
    const patchGeo = new THREE.PlaneGeometry(1, 1); patchGeo.rotateX(-Math.PI / 2);
    const fields = [];
    for (let i = 0; i < 2600; i++) {
      const x = (rnd() - 0.5) * 2600, z = (rnd() - 0.5) * 2600, w = 40 + rnd() * 110, d = 30 + rnd() * 80;
      if (inSite(x, z, 90) || inRiver(z, d * 0.6 + 10) || nearRoad(x, z, Math.max(w, d) * 0.6 + 8)) continue;
      if (fields.some(f => Math.abs(f[0] - x) < (f[2] + w) / 2 + 6 && Math.abs(f[1] - z) < (f[3] + d) / 2 + 6)) continue;
      fields.push([x, z, w, d]);
    }
    const fm = new THREE.InstancedMesh(patchGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), fields.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const tones = ['#6a7d4c', '#7d8a55', '#5d7046', '#96945f', '#74805a', '#8a7c58', '#566a44', '#a39a6a'];
    fields.forEach((f, i) => {
      e.set(0, 0.08 + (rnd() - 0.5) * 0.12, 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(f[0], -0.05 + i * 0.00008, f[1]), q, new THREE.Vector3(f[2], 1, f[3]));
      fm.setMatrixAt(i, m); col.set(tones[rnd() * tones.length | 0]); col.offsetHSL(0, 0, (rnd() - 0.5) * 0.06); fm.setColorAt(i, col);
    });
    fm.receiveShadow = true; g.add(fm);

    // 河
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x33524f, metalness: 0.85, roughness: 0.14, normalMap: ML.normalMap(256, 5, ML.rng(8)) });
    waterMat.normalMap.repeat.set(300, 3); waterMat.normalScale.set(0.35, 0.35);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, RIVER[1] - RIVER[0]), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.set(0, -0.02, (RIVER[0] + RIVER[1]) / 2); g.add(water);
    ML.water = waterMat; ML.waterMesh = water;
    const bankMat = new THREE.MeshStandardMaterial({ color: 0x9a978d, roughness: 0.95 });
    [RIVER[0] - 0.6, RIVER[1] + 0.6].forEach(z => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(9000, 0.5, 1.2), bankMat); b.position.set(0, 0, z); b.receiveShadow = true; g.add(b);
    });
    for (let x = -1500; x < 1500; x += 9 + rnd() * 8) {
      if (Math.abs(x + 143) < 14) continue;
      if (x < -150 || x > 122) trees.add(x, RIVER[0] - 4 - rnd() * 3, 1.3 + rnd() * 0.8);
      trees.add(x + 4, RIVER[1] + 4 + rnd() * 4, 1.3 + rnd() * 0.9);
    }

    // 道路
    const roadMat = new THREE.MeshStandardMaterial({ map: ML.roadTex(), roughness: 0.92 });
    [p1, p2].forEach((p, i) => {
      const r = new THREE.Mesh(ML.ribbon(p.pts, i ? 8.5 : 10, 0.02 + i * 0.004, 12), roadMat); r.receiveShadow = true; g.add(r);
    });
    // 桥
    const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 0.5, 40), new THREE.MeshStandardMaterial({ color: 0xb0aea6, roughness: 0.9 }));
    deck.position.set(-142.6, -0.24, 125); deck.rotation.y = -0.146; deck.receiveShadow = true; g.add(deck);
    [-6.3, 6.3].forEach(o => { const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 40), bankMat); r.position.set(-142.6 + o, 0.55, 125 + o * 0.146); r.rotation.y = -0.146; r.castShadow = true; g.add(r); });
    // 大门口与外部道路之间的路面
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x45484c, roughness: 0.95 });
    const apron = (x, z, w, d, ry) => { const a = new THREE.Mesh(new THREE.PlaneGeometry(w, d), apronMat); a.rotation.set(-Math.PI / 2, 0, ry || 0); a.position.set(x, 0.012, z); a.receiveShadow = true; g.add(a); };
    apron(-70, 8, 22, 26); apron(-16, -77, 16, 14, 0.94);

    // 沿路行道树
    [p1, p2].forEach((p, pi) => {
      for (let d = 0; d < p.length; d += 11) {
        const o = p.at(d, {});
        [-1, 1].forEach(sd => {
          const x = o.x - o.tz * sd * 8.5, z = o.z + o.tx * sd * 8.5;
          if (inSite(x, z, 3) || inRiver(z, 4) || (pi === 1 && Math.abs(x + 70) < 16 && Math.abs(z - 6) < 20) || Math.hypot(x + 14, z + 80) < 12) return;
          trees.add(x, z, 1.25 + rnd() * 0.5);
        });
      }
    });

    // 田间地头的散树、树丛
    for (let i = 0; i < 520; i++) {
      const x = (rnd() - 0.5) * 2400, z = (rnd() - 0.5) * 2400;
      if (inSite(x, z, 10) || inRiver(z, 6) || nearRoad(x, z, 9)) continue;
      const n = 1 + (rnd() * 5 | 0);
      for (let k = 0; k < n; k++) {
        const tx = x + (rnd() - 0.5) * 22, tz = z + (rnd() - 0.5) * 22;
        if (inSite(tx, tz, 4) || inRiver(tz, 4) || nearRoad(tx, tz, 7)) continue;
        trees.add(tx, tz, 1.1 + rnd() * 1.1);
      }
    }
    // 高压线：西北角两基铁塔
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.6, metalness: 0.5 });
    const pyl = [[-120, -62], [-40, -170], [40, -278]];
    pyl.forEach(p => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.6, 34, 4, 6), new THREE.MeshStandardMaterial({ color: 0x8b9096, wireframe: true }));
      t.position.set(p[0], 17, p[1]); g.add(t);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(12, 0.35, 0.35), pylonMat); arm.position.set(p[0], 31, p[1]); arm.rotation.y = 0.62; arm.castShadow = true; g.add(arm);
    });
    const wire = [];
    for (let i = 0; i < pyl.length - 1; i++) [-5.5, 5.5].forEach(o => {
      const a = pyl[i], b = pyl[i + 1], ox = Math.cos(0.62) * o, oz = -Math.sin(0.62) * o;
      for (let k = 0; k < 12; k++) {
        const t0 = k / 12, t1 = (k + 1) / 12, sag = t => 31 - Math.sin(t * Math.PI) * 5;
        wire.push(ML.lerp(a[0], b[0], t0) + ox, sag(t0), ML.lerp(a[1], b[1], t0) + oz, ML.lerp(a[0], b[0], t1) + ox, sag(t1), ML.lerp(a[1], b[1], t1) + oz);
      }
    });
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    g.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x30343a })));
  };
})(window.ML);
