'use strict';
/* 启动、相机（鸟瞰 / 漫游）、点选、楼号标签、时钟 */
(function (ML) {
  const S = window.SITE;
  const canvas = document.getElementById('view');
  const $ = id => document.getElementById(id);

  function start() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    ML.maxAniso = renderer.capabilities.getMaxAnisotropy();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 2, 12000);

    const env = ML.buildSky(scene, renderer);
    const trees = new ML.Trees();
    ML.buildSurroundings(scene, trees, env);
    ML.buildCampus(scene, trees, env);
    trees.build(scene);
    ML.scene = scene; ML.camera = camera; ML.renderer = renderer; ML.env = env;

    /* ---- 时间：跟随真实时钟；ML.setClock('18:10') 可临时指定，ML.setClock(null) 恢复 ---- */
    let fixedHour = null, shownHour = -1;
    const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
    ML.setClock = function (v) {
      if (v == null) fixedHour = null;
      else if (typeof v === 'number') fixedHour = v;
      else { const p = String(v).split(':'); fixedHour = (+p[0]) + (+p[1] || 0) / 60; }
      shownHour = -1;
    };
    function syncClock() {
      const h = fixedHour == null ? nowHour() : fixedHour;
      if (Math.abs(h - shownHour) > 0.02) { env.setHour(h); shownHour = h; }
      const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · 常熟市梅李镇`;
    }

    /* ---- 相机 ---- */
    const HOME = { tx: -24, tz: 14, dist: 292 * Math.max(1, 1.5 / (window.innerWidth / window.innerHeight)), az: -0.62, pol: 0.95 }; // 窗口窄时退远一点，保证整个园区入画
    const orbit = Object.assign({}, HOME), goal = Object.assign({}, HOME);
    const walk = { x: -84, z: 7, yaw: -Math.PI / 2, pitch: -0.02 };
    let mode = 'orbit';
    const keys = {};
    const hints = { orbit: '拖动旋转 · 右键或 Shift 拖动平移 · 滚轮缩放 · 点击楼栋查看信息', walk: 'W A S D 行走 · 拖动环顾 · Shift 加速 · Esc 返回鸟瞰' };
    function setMode(m) {
      mode = m;
      document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
      $('hint').textContent = hints[m];
      camera.fov = m === 'walk' ? 62 : 42; camera.near = m === 'walk' ? 0.4 : 2; camera.updateProjectionMatrix();
    }
    function applyCamera(dt) {
      if (mode === 'orbit') {
        const k = 1 - Math.exp(-dt * 7);
        ['tx', 'tz', 'dist', 'az', 'pol'].forEach(p => orbit[p] += (goal[p] - orbit[p]) * k);
        const sp = Math.sin(orbit.pol), cp = Math.cos(orbit.pol);
        camera.position.set(orbit.tx + orbit.dist * sp * Math.sin(orbit.az), Math.max(1.5, orbit.dist * cp), orbit.tz + orbit.dist * sp * Math.cos(orbit.az));
        camera.lookAt(orbit.tx, 0, orbit.tz);
      } else {
        const sp = (keys.shift ? 14 : 4.2) * dt;
        const fx = Math.sin(walk.yaw), fz = Math.cos(walk.yaw);
        let mx = 0, mz = 0;
        if (keys.w || keys.arrowup) { mx -= fx; mz -= fz; }
        if (keys.s || keys.arrowdown) { mx += fx; mz += fz; }
        if (keys.a || keys.arrowleft) { mx -= fz; mz += fx; }
        if (keys.d || keys.arrowright) { mx += fz; mz -= fx; }
        const l = Math.hypot(mx, mz);
        if (l > 0) {
          const nx = walk.x + mx / l * sp, nz = walk.z + mz / l * sp;
          const hit = (x, z) => S.buildings.some(b => ML.inRect(x, z, b.rect, 0.7));
          if (!hit(nx, walk.z)) walk.x = ML.clamp(nx, -600, 600);
          if (!hit(walk.x, nz)) walk.z = ML.clamp(nz, -600, 600);
        }
        camera.position.set(walk.x, 1.68, walk.z);
        camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
      }
    }

    /* ---- 输入 ---- */
    let drag = null, moved = 0;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId); canvas.focus();
      drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; moved = 0; canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (mode === 'walk') { walk.yaw -= dx * 0.004; walk.pitch = ML.clamp(walk.pitch - dy * 0.003, -1.2, 1.2); return; }
      if (drag.pan) {
        const s = goal.dist * 0.0016, ca = Math.cos(goal.az), sa = Math.sin(goal.az);
        goal.tx = ML.clamp(goal.tx - (dx * ca + dy * sa) * s, -400, 400);
        goal.tz = ML.clamp(goal.tz - (-dx * sa + dy * ca) * s, -400, 400);
      } else {
        goal.az -= dx * 0.005; goal.pol = ML.clamp(goal.pol - dy * 0.004, 0.12, 1.5);
      }
    });
    const up = e => { if (drag && moved < 5 && mode === 'orbit') pickAt(e.clientX, e.clientY); drag = null; canvas.classList.remove('dragging'); };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (mode === 'orbit') goal.dist = ML.clamp(goal.dist * Math.exp(e.deltaY * 0.0012), 25, 1400);
    }, { passive: false });
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase(); keys[k] = true;
      if (k === 'escape') { if (mode === 'walk') setMode('orbit'); else select(null); }
    });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    document.querySelectorAll('#mode button').forEach(b => b.addEventListener('click', () => { select(null); setMode(b.dataset.m); }));
    $('btnHome').addEventListener('click', () => { setMode('orbit'); select(null); Object.assign(goal, HOME, { az: goal.az + Math.round((HOME.az - goal.az) / (Math.PI * 2)) * 0 }); goal.az = HOME.az + Math.round((orbit.az - HOME.az) / (Math.PI * 2)) * Math.PI * 2; });

    /* ---- 楼号标签、点选 ---- */
    const labelBox = $('labels'), labels = [];
    S.buildings.forEach(b => {
      const el = document.createElement('div'); el.className = 'lb'; el.textContent = b.id + '#';
      el.addEventListener('click', () => select(b));
      labelBox.appendChild(el);
      const p = ML.places.buildings[b.id];
      labels.push({ el, b, pos: new THREE.Vector3(p.center[0], p.height + (b.top || 0) + 3, p.center[1]) });
    });
    let showLabels = true;
    $('btnLabel').addEventListener('click', () => { showLabels = !showLabels; $('btnLabel').classList.toggle('on', showLabels); labelBox.style.display = showLabels ? '' : 'none'; });
    const v3 = new THREE.Vector3();
    function placeLabels() {
      labelBox.style.visibility = mode === 'walk' ? 'hidden' : '';
      if (!showLabels || mode === 'walk') return;
      const w = window.innerWidth, h = window.innerHeight;
      labels.forEach(l => {
        v3.copy(l.pos).project(camera);
        const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
        l.el.style.display = vis ? '' : 'none';
        if (vis) l.el.style.transform = `translate(${((v3.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v3.y) / 2 * h - 14).toFixed(1)}px) translate(-50%, -100%)`;
      });
    }

    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xff8a3c, fog: false }));
    outline.visible = false; scene.add(outline);
    let selected = null;
    function select(b) {
      selected = b;
      labels.forEach(l => l.el.classList.toggle('on', l.b === b));
      const card = $('card');
      if (!b) { outline.visible = false; card.style.display = 'none'; return; }
      const r = b.rect, w = r[2] - r[0], d = r[3] - r[1], H = b.h;
      outline.position.set((r[0] + r[2]) / 2, H / 2 + 0.6, (r[1] + r[3]) / 2); outline.scale.set(w + 0.8, H + 1.6, d + 0.8); outline.visible = true;
      card.querySelector('h2').textContent = b.name;
      card.querySelector('.use').textContent = b.use;
      const rows = [['地上层数', b.floors.length + ' 层' + (b.id === 4 || b.id === 6 ? '（局部）' : '')], ['建筑高度', b.h.toFixed(1) + ' 米'], ['占地', `${w.toFixed(1)} × ${d.toFixed(1)} 米，约 ${Math.round(w * d).toLocaleString()} ㎡`]];
      if (b.id === 11) rows.push(['1 层', '餐厅 · 监控中心'], ['2 层', '物业服务中心 · 运营中心 · 展厅'], ['3–6 层', '宿舍，每层约 23 间']);
      else if (b.tenants.length) rows.push(['入驻企业', b.tenants.join('、')]);
      card.querySelector('dl').innerHTML = rows.map(x => `<dt>${x[0]}</dt><dd>${x[1]}</dd>`).join('');
      card.style.display = 'block';
      if (mode === 'orbit') { goal.tx = (r[0] + r[2]) / 2; goal.tz = (r[1] + r[3]) / 2; goal.dist = ML.clamp(Math.max(w, d) * 2.4, 110, 240); goal.pol = Math.min(goal.pol, 1.08); }
    }
    ML.view = o => { if (o.walk) { setMode('walk'); Object.assign(walk, o.walk); } else { setMode('orbit'); Object.assign(goal, o); Object.assign(orbit, o); } };
    ML.select = id => select(S.buildings.find(b => b.id === id) || null);
    $('card').querySelector('.x').addEventListener('click', () => select(null));
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function pickAt(x, y) {
      ndc.set(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(ML.pick, false)[0];
      select(hit ? hit.object.userData.b : null);
    }

    /* ---- 循环 ---- */
    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize); resize(); setMode('orbit');
    syncClock(); setInterval(syncClock, 20000);

    /* ---- 备选风格：地址后加 ?style=clay | tech | line | mini 查看，不加就是写实 ---- */
    function applyStyle(name) {
      if (!name || name === 'real') return;
      const U = env.sky.material.uniforms;
      const eachMesh = fn => scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o !== env.sky && o !== outline && !(o.material && o.material.blending === THREE.AdditiveBlending)) fn(o); });
      const edges = color => ML.pick.forEach(m => {
        const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color, fog: false }));
        l.position.copy(m.position); scene.add(l);
      });
      const flatSky = (top, hor) => { U.top.value.set(top); U.horizon.value.set(hor); U.cover.value = 5; U.stars.value = 0; U.sunColor.value.set(0x000000); scene.fog.color.set(hor); };
      if (name === 'mini') {            // 微缩模型：长焦 + 高饱和 + 上下虚化
        ML.setClock(15.5); syncClock();
        canvas.style.filter = 'saturate(1.45) contrast(1.06) brightness(1.04)';
        ['top:0;height:30%;-webkit-mask-image:linear-gradient(#000,transparent);mask-image:linear-gradient(#000,transparent)', 'bottom:0;height:26%;-webkit-mask-image:linear-gradient(transparent,#000);mask-image:linear-gradient(transparent,#000)'].forEach(css => {
          const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;right:0;pointer-events:none;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);' + css; document.body.insertBefore(d, labelBox);
        });
        hints.orbit = hints.orbit; camera.fov = 20; camera.updateProjectionMatrix();
        [HOME, goal, orbit].forEach(o => { o.dist *= 2.15; o.pol = 0.9; });
        scene.fog.density *= 0.35;
        return;
      }
      ML.setClock(name === 'tech' ? 22 : 14); syncClock();
      if (name === 'clay') {            // 素模沙盘：去色，只留体块、窗格和光影
        canvas.style.filter = 'grayscale(1) contrast(0.8) brightness(1.2)';
        eachMesh(o => { if (o.isInstancedMesh && o.geometry.attributes.color) { o.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }); o.instanceColor = null; } });
        ML.ground.material.color.set(0xd8d8d8); scene.fog.density = 0.0005;
      } else if (name === 'line') {     // 建筑线稿：浅色平涂 + 轮廓线
        const paper = new THREE.MeshLambertMaterial({ color: 0xfbfaf6 });
        const tint = new THREE.MeshLambertMaterial({ color: 0xdfe9d8 }), blue = new THREE.MeshLambertMaterial({ color: 0xcfe0ea });
        eachMesh(o => { const tree = o.isInstancedMesh && o.geometry.attributes.color; o.material = o === ML.waterMesh ? blue : tree ? tint : paper; if (o.isInstancedMesh) o.instanceColor = null; });
        edges(0x2a2f36); flatSky(0xf3f1ea, 0xf3f1ea); scene.fog.density = 0.0004;
        env.hemi.color.set(0xffffff); env.hemi.groundColor.set(0xe6e2d8); env.hemi.intensity = 1.5; scene.environmentIntensity = 0;
        env.sun.intensity = 1.2; renderer.toneMapping = THREE.NoToneMapping;
      } else if (name === 'tech') {     // 科技蓝数字孪生：深色底 + 发光轮廓
        const body = new THREE.MeshStandardMaterial({ color: 0x15487a, emissive: 0x0f3a6e, emissiveIntensity: 1, roughness: 0.5, metalness: 0.3 });
        const base = new THREE.MeshStandardMaterial({ color: 0x0e3358, emissive: 0x0a2748, emissiveIntensity: 1, roughness: 0.9 });
        const leaf = new THREE.MeshStandardMaterial({ color: 0x0c3b4a, emissive: 0x08303c, emissiveIntensity: 0.8 });
        eachMesh(o => { const tree = o.isInstancedMesh && o.geometry.attributes.color; o.material = ML.pick.indexOf(o) >= 0 ? body : tree ? leaf : base; if (o.isInstancedMesh) o.instanceColor = null; });
        scene.traverse(o => { if (o.material && o.material.blending === THREE.AdditiveBlending) o.visible = false; });
        ML.ground.material = new THREE.MeshStandardMaterial({ color: 0x0a2038, emissive: 0x081a30, emissiveIntensity: 1, roughness: 0.9 });
        edges(0x48d6ff); flatSky(0x030a16, 0x071a30); scene.fog.density = 0.0012;
        env.hemi.intensity = 0.6; env.hemi.color.set(0x3a7bd0); scene.environmentIntensity = 0.1; env.sun.intensity = 0.5; env.sun.color.set(0x6fb0ff);
        renderer.toneMappingExposure = 1.3;
        document.body.style.color = '#dff3ff';
        document.querySelectorAll('.panel').forEach(p => { p.style.background = 'rgba(8,24,44,0.72)'; p.style.borderColor = 'rgba(72,214,255,0.35)'; p.style.color = '#dff3ff'; });
      }
    }
    applyStyle(new URLSearchParams(location.search).get('style'));
    let last = performance.now(), t = 0;
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
      if (shownHour < 0) syncClock();
      applyCamera(dt);
      ML.updateMovers(dt);
      if (ML.water) ML.water.normalMap.offset.set(t * 0.004, t * 0.01);
      env.tick(t, camera);
      renderer.render(scene, camera);
      placeLabels();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const ld = $('loading'); ld.style.opacity = 0; setTimeout(() => ld.remove(), 700);
  }

  // 先让“正在生成”显示出来，再开始建模
  setTimeout(() => {
    try { start(); } catch (err) { console.error(err); $('loading').textContent = '生成失败：' + err.message; }
  }, 60);
})(window.ML);
