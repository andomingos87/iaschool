/* AIESCOLA — filme de apresentação (30 s, 1920×1080).
 * Mundo 3D: as quatro telas do app ficam deitadas num chão de estúdio, lado a lado.
 * A câmera (#cam + #pan) desliza de uma tela para a outra; as peças que importam
 * saem da tela e levantam. Todos os dados são fictícios e as fotos são ilustrações
 * sem rosto (regra de marca: nada de foto real de criança).
 */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const pan = $("#pan");
  const overlay = $("#overlay");
  const hud = $("#hud");
  const phone = $("#phone");
  const endcard = $("#endcard");

  const tl = gsap.timeline({ paused: true, defaults: { lazy: false } });
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;

  /* ---------- utilidades ---------- */
  const ic = (n, s = 18, style = "") =>
    `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;${style}">${window.ICONS[n]}</svg>`;
  const WA_PATH =
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";
  const wa = (s, c = "#fff") => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" style="display:block"><path fill="${c}" d="${WA_PATH}"/></svg>`;
  const SPARK = "M12 0Q13.4 10.6 24 12Q13.4 13.4 12 24Q10.6 13.4 0 12Q10.6 10.6 12 0Z";
  const spark = (s, c) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" style="display:block"><path fill="${c}" d="${SPARK}"/></svg>`;
  const CURSOR =
    '<svg width="34" height="44" viewBox="0 0 34 44"><path d="M3 2 L3 33 L10.5 26 L15.5 38 L21 35.6 L16 24 L26 24 Z" fill="#0F1A3D" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/></svg>';

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function add(parent, html) {
    const e = el(html);
    parent.appendChild(e);
    return e;
  }

  /* mapa de tempo (v02): os tempos escritos neste arquivo são os da v01; W() estica a
   * abertura para a narração caber (cenas 1 e 2) e, depois de 5,4 s, tudo anda +2,6 s.
   * Narração e seus tempos ficam no index.html (<audio> #vo1 a #vo8). */
  const WARP = [[0, 0], [2.8, 3.85], [5.4, 8.0]];
  const DUR = 34;
  function W(t) {
    for (let i = 1; i < WARP.length; i++) {
      const [a0, b0] = WARP[i - 1];
      const [a1, b1] = WARP[i];
      if (t <= a1) return b0 + ((t - a0) * (b1 - b0)) / (a1 - a0);
    }
    const [a, b] = WARP[WARP.length - 1];
    return b + (t - a);
  }
  const span = (at, dur) => Math.max(W(at + dur) - W(at), 0.001);

  /* efeitos sonoros: cada evento guarda o tempo já esticado; a lista sai em window.__sfx
   * e audio/efeitos.py gera a faixa motion/assets/efeitos/efeitos.wav a partir dela */
  const SFX = [];
  const sfx = (k, at) => SFX.push([k, Math.round(W(at) * 1000) / 1000]);

  /* estado conhecido de cada alvo: toda animação parte de valores explícitos */
  const ST = new Map();
  function init(t, props) {
    ST.set(t, Object.assign({}, ST.get(t) || {}, props));
    tl.set(t, props, 0);
  }
  function go(t, at, dur, props, ease = "power2.inOut") {
    const cur = ST.get(t) || {};
    const from = {};
    for (const k in props) {
      if (!(k in cur)) throw new Error("sem estado inicial: " + k + " em " + (t.id || t.className || t));
      from[k] = cur[k];
    }
    tl.fromTo(t, from, Object.assign({}, props, { duration: span(at, dur), ease, immediateRender: false }), W(at));
    ST.set(t, Object.assign({}, cur, props));
  }
  function setAt(t, at, props) {
    const cur = ST.get(t) || {};
    const from = {};
    for (const k in props) from[k] = k in cur ? cur[k] : props[k];
    tl.fromTo(t, from, Object.assign({}, props, { duration: 0.001, immediateRender: false }), W(at));
    ST.set(t, Object.assign({}, cur, props));
  }
  function counter(node, at, dur, from, to, fmt, ease = "power1.inOut") {
    const o = { v: from };
    node.textContent = fmt(from);
    tl.fromTo(
      o,
      { v: from },
      { v: to, duration: span(at, dur), ease, immediateRender: false, onUpdate: () => (node.textContent = fmt(Math.round(o.v))) },
      W(at)
    );
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- fotos ilustradas (sem rosto, sem pessoa real) ---------- */
  const SKIES = [["#FFE9A8", "#F9A66E"], ["#E6EAF7", "#9DB0FF"], ["#FFE3CF", "#F7A36B"], ["#DCE6FF", "#7C93F0"], ["#FFF1C9", "#FFC56B"]];
  const GROUNDS = ["#E9D3A8", "#D8E7C5", "#E8DCC4"];
  const FLAGS = ["#2447D6", "#F26B1D", "#FFD25A", "#3BA55C", "#7C93F0", "#E8437A"];
  const SKINS = ["#F1C9A5", "#A86F4C", "#6B4532", "#E8B48F", "#C68A62"];
  const HAIRS = ["#2B1A10", "#1B1B1B", "#C98B4A", "#5A3A22", "#8A5A2B"];
  const SHIRTS = ["#2447D6", "#F26B1D", "#7C93F0", "#3BA55C", "#0F1A3D", "#E8437A", "#9DB0FF"];
  const LIA = { skin: "#D9A27A", hair: "#2B1A10", shirt: "#FFD25A", plaid: true, hat: true, pig: true };
  const LOOK = { skin: "#E8B48F", hair: "#8A5A2B", shirt: "#FFD25A", plaid: true, hat: true, pig: false };
  let uid = 0;

  function figure(x, g, h, o) {
    const w = h * 0.62;
    const r = h * 0.27;
    const top = g - h;
    const hy = top - r * 0.82;
    let s = "";
    s += `<path d="M${x - w / 2} ${g} L${x - w / 2} ${top + w * 0.35} Q${x - w / 2} ${top} ${x} ${top} Q${x + w / 2} ${top} ${x + w / 2} ${top + w * 0.35} L${x + w / 2} ${g} Z" fill="${o.shirt}"/>`;
    if (o.plaid)
      s += `<path d="M${x - w / 2} ${top + h * 0.38} H${x + w / 2} M${x - w / 2} ${top + h * 0.66} H${x + w / 2} M${x - w * 0.14} ${top + 3} V${g} M${x + w * 0.2} ${top + 3} V${g}" stroke="#F26B1D" stroke-width="${Math.max(2, h * 0.035)}" opacity=".75"/>`;
    if (o.pig) s += `<circle cx="${x - r * 1.02}" cy="${hy + r * 0.25}" r="${r * 0.42}" fill="${o.hair}"/><circle cx="${x + r * 1.02}" cy="${hy + r * 0.25}" r="${r * 0.42}" fill="${o.hair}"/>`;
    s += `<circle cx="${x}" cy="${hy}" r="${r}" fill="${o.skin}"/>`;
    s += `<path d="M${x - r} ${hy - r * 0.08} A${r} ${r} 0 0 1 ${x + r} ${hy - r * 0.08} Z" fill="${o.hair}"/>`;
    if (o.hat)
      s += `<path d="M${x - r * 1.75} ${hy - r * 0.42} L${x + r * 1.75} ${hy - r * 0.42} L${x} ${hy - r * 1.95} Z" fill="#E8C66A"/><path d="M${x - r * 0.95} ${hy - r * 0.78} L${x + r * 0.95} ${hy - r * 0.78}" stroke="#C0392B" stroke-width="${r * 0.18}"/>`;
    return { s, head: { x, y: hy, r } };
  }

  /* o: { main: "lia"|"look"|null, blur: bool, rings: bool, count } */
  function photo(seed, o = {}) {
    const R = rng(seed * 7919 + 13);
    const id = "f" + uid++;
    const sky = SKIES[Math.floor(R() * SKIES.length)];
    const ground = GROUNDS[Math.floor(R() * GROUNDS.length)];
    let s = `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient><filter id="${id}b" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter></defs>`;
    s += `<rect width="400" height="300" fill="url(#${id}g)"/>`;
    const kind = Math.floor(R() * 3);
    if (kind === 0) {
      const bx = 20 + R() * 230;
      s += `<rect x="${bx}" y="124" width="140" height="96" fill="#fff" opacity=".92"/>`;
      for (let i = 0; i < 5; i++) s += `<path d="M${bx + i * 28} 124 L${bx + 28 + i * 28} 124 L${bx + 14 + i * 28} 98 Z" fill="${i % 2 ? "#F26B1D" : "#fff"}"/>`;
      s += `<rect x="${bx}" y="150" width="140" height="10" fill="#F26B1D" opacity=".85"/>`;
    } else if (kind === 1) {
      const fx = 50 + R() * 290;
      s += `<path d="M${fx - 34} 224 L${fx + 34} 208 M${fx - 34} 208 L${fx + 34} 224" stroke="#6B4532" stroke-width="9" stroke-linecap="round"/><path d="M${fx - 24} 212 Q${fx - 20} 172 ${fx} 150 Q${fx + 20} 172 ${fx + 24} 212 Z" fill="#F26B1D"/><path d="M${fx - 12} 212 Q${fx - 8} 186 ${fx} 172 Q${fx + 9} 188 ${fx + 12} 212 Z" fill="#FFD25A"/>`;
    } else {
      for (let i = 0; i < 3; i++) {
        const lx = 50 + R() * 300;
        const ly = 96 + R() * 46;
        s += `<line x1="${lx}" y1="${ly - 44}" x2="${lx}" y2="${ly - 14}" stroke="#0F1A3D" stroke-width="1.5" opacity=".35"/><rect x="${lx - 11}" y="${ly - 14}" width="22" height="30" rx="8" fill="${FLAGS[(i + seed) % FLAGS.length]}"/>`;
      }
    }
    s += `<rect y="216" width="400" height="84" fill="${ground}"/>`;
    const sag = 16 + R() * 16;
    const y0 = 22 + R() * 14;
    const n = 11;
    let line = "";
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      line += (i ? " L" : "M") + (-6 + t * 412).toFixed(1) + " " + (y0 + Math.sin(t * Math.PI) * sag).toFixed(1);
    }
    s += `<path d="${line}" stroke="#0F1A3D" stroke-width="1.5" fill="none" opacity=".4"/>`;
    for (let i = 0; i < n - 1; i++) {
      const t = (i + 0.5) / (n - 1);
      const x = -6 + t * 412;
      const y = y0 + Math.sin(t * Math.PI) * sag;
      s += `<path d="M${(x - 14).toFixed(1)} ${y.toFixed(1)} L${(x + 14).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + 26).toFixed(1)} Z" fill="${FLAGS[(i + seed) % FLAGS.length]}"/>`;
    }
    const count = o.count || 2 + Math.floor(R() * 3);
    const mainIdx = o.main ? Math.floor(count / 2) : -1;
    const people = [];
    for (let i = 0; i < count; i++) {
      const x = 60 + ((i + 0.5) / count) * 280 + (R() - 0.5) * 30;
      const g = 268 + R() * 22;
      const h = (i === mainIdx ? 128 : 104) + R() * 26;
      const look =
        i === mainIdx
          ? o.main === "lia"
            ? LIA
            : LOOK
          : {
              skin: SKINS[Math.floor(R() * SKINS.length)],
              hair: HAIRS[Math.floor(R() * HAIRS.length)],
              shirt: SHIRTS[Math.floor(R() * SHIRTS.length)],
              hat: R() < 0.35,
              pig: R() < 0.3,
            };
      people.push({ x, g, h, look, main: i === mainIdx });
    }
    people.sort((a, b) => a.g - b.g);
    let head = null;
    for (const p of people) {
      const f = figure(p.x, p.g, p.h, p.look);
      if (p.main) head = f.head;
      s += o.blur && !p.main ? `<g filter="url(#${id}b)">${f.s}</g>` : f.s;
    }
    if (o.rings && head) {
      const rr = head.r + 12;
      s += `<g class="rai" opacity="0"><circle cx="${head.x}" cy="${head.y}" r="${rr}" fill="none" stroke="#F26B1D" stroke-width="8" stroke-dasharray="14 9"/><rect x="${head.x - 44}" y="${head.y + rr + 6}" width="88" height="28" rx="8" fill="#F26B1D"/><text x="${head.x}" y="${head.y + rr + 25}" font-family="Inter" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">Lia M.?</text></g>`;
      s += `<g class="rok" opacity="0"><circle cx="${head.x}" cy="${head.y}" r="${rr}" fill="none" stroke="#2563EB" stroke-width="8"/><rect x="${head.x - 48}" y="${head.y + rr + 6}" width="96" height="28" rx="8" fill="#2563EB"/><text x="${head.x}" y="${head.y + rr + 25}" font-family="Inter" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">Lia M. ✓</text></g>`;
    }
    return s + "</svg>";
  }

  /* ---------- projeção (para posicionar o que voa por cima do mundo) ---------- */
  const P = 2000;
  let CAM = { fx: -1250, fy: 430, z: -200, tilt: 46, ox: 0, oy: 230 };
  function project(wx, wy, wz, c) {
    const x = wx - c.fx;
    const y = wy - c.fy;
    const a = (c.tilt * Math.PI) / 180;
    const y1 = y * Math.cos(a) - wz * Math.sin(a);
    const z1 = y * Math.sin(a) + wz * Math.cos(a);
    const X = x + c.ox;
    const Y = y1 + c.oy;
    const Z = z1 + c.z;
    const k = P / (P - Z);
    return { x: 960 + X * k, y: 540 + Y * k };
  }

  /* ---------- câmera ---------- */
  const cam = $("#cam");
  init(cam, { x: CAM.ox, y: CAM.oy, z: CAM.z, rotationX: CAM.tilt });
  init(pan, { x: -CAM.fx, y: -CAM.fy });
  function camTo(at, dur, c, ease = "power3.inOut") {
    go(cam, at, dur, { x: c.ox, y: c.oy, z: c.z, rotationX: c.tilt }, ease);
    go(pan, at, dur, { x: -c.fx, y: -c.fy }, ease);
    CAM = Object.assign({}, c);
  }

  /* ---------- telas do app ---------- */
  const NAV = [["home", "Início"], ["sparkles", "Criar arte", 1], ["gallery", "Galeria"], ["calendar", "Eventos"], ["users", "Alunos"], ["grad", "Turmas"], ["school", "Escola"], ["images", "Modelos de arte"]];
  function shell(active) {
    return (
      `<div class="sb"><img class="logo" src="assets/aiescola-logo.svg"/><div class="grp">Menu</div>` +
      NAV.map(([i, l, ia]) => `<div class="it ${l === active ? "on" : ""}">${ic(i, 18)}<span>${l}</span>${ia ? '<span class="ia">IA</span>' : ""}</div>`).join("") +
      `<div class="foot"><div class="av">CH</div><div><b>Coordenação Horizonte</b><span>Administrador da escola</span></div></div></div>` +
      `<div class="top">${ic("sidebar", 18)}<div class="r"><span class="chip">${ic("school", 14)} Escola Horizonte</span>${ic("sun", 18)}<div class="av" style="width:30px;height:30px">CH</div></div></div>`
    );
  }
  function header(crumb, title, sub, btns = "") {
    return `<div class="main"><div class="crumb">${ic("arrowleft", 15)} ${crumb}</div><div class="h1">${title}</div><div class="sub">${sub}</div><div class="hbtns">${btns}</div></div>`;
  }
  function screen(id, ox, oy, active, inner) {
    const s = add(pan, `<div class="app" id="${id}" style="left:${ox}px;top:${oy}px">${shell(active)}${inner}</div>`);
    s._o = { x: ox, y: oy };
    return s;
  }
  function piece(scr, id, x, y, w, h, inner, extraStyle = "") {
    add(scr, `<div class="slot" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    const wx = scr._o.x + x;
    const wy = scr._o.y + y;
    const sh = add(pan, `<div class="shadow" style="left:${wx + 10}px;top:${wy + 10}px;width:${w - 20}px;height:${h - 20}px"></div>`);
    const e = add(pan, `<div class="card w" id="${id}" style="left:${wx}px;top:${wy}px;width:${w}px;height:${h}px;${extraStyle}">${inner}</div>`);
    init(e, { z: 1, rotationX: 0 });
    init(sh, { autoAlpha: 0, x: 0, y: 0 });
    return { el: e, sh, wx, wy, w, h };
  }
  function lift(p, at, dur, z, rot, ease = "power3.out") {
    go(p.el, at, dur, { z, rotationX: -rot }, ease);
    go(p.sh, at, dur, { autoAlpha: z > 3 ? 1 : 0, x: z * 0.12, y: 6 + z * 0.3 }, ease);
    p.z = z;
    p.rot = rot;
  }
  /* ponto na superfície de uma peça levantada (girada pela borda de baixo) */
  function onP(p, lx, ly) {
    const r = p.h - ly;
    const th = ((p.rot || 0) * Math.PI) / 180;
    return { x: p.wx + lx, y: p.wy + p.h - r * Math.cos(th), z: (p.z || 1) + r * Math.sin(th) + 3, rotationX: -(p.rot || 0) };
  }

  /* ---------- cursor e clique ---------- */
  const cur = add(pan, `<div class="cursor" id="cursor">${CURSOR}</div>`);
  init(cur, { x: -900, y: 260, z: 30, rotationX: 0, scale: 1.25, autoAlpha: 0 });
  function curTo(at, dur, pt, ease = "power2.inOut") {
    go(cur, at, dur, pt, ease);
  }
  function click(at, pt) {
    sfx("clique", at);
    go(cur, at - 0.07, 0.07, { scale: 1.05 }, "power1.in");
    go(cur, at, 0.12, { scale: 1.25 }, "power1.out");
    const r = add(pan, `<div class="click" style="left:${pt.x}px;top:${pt.y}px"></div>`);
    init(r, { z: pt.z, rotationX: pt.rotationX || 0, scale: 0.3, autoAlpha: 0 });
    setAt(r, at, { autoAlpha: 1 });
    go(r, at, 0.45, { scale: 1.6, autoAlpha: 0 }, "power2.out");
  }
  function press(node, at) {
    init(node, { scale: 1 });
    go(node, at, 0.06, { scale: 0.95 }, "power1.in");
    go(node, at + 0.06, 0.14, { scale: 1 }, "back.out(2)");
  }
  function swap(a, b, at, dur = 0.16) {
    go(a, at, dur, { autoAlpha: 0 }, "power1.out");
    go(b, at, dur, { autoAlpha: 1 }, "power1.out");
  }

  /* ---------- títulos ---------- */
  function headline(lines, out, style = "") {
    const box = add(hud, `<div class="hl" style="${style}"></div>`);
    const words = [];
    lines.forEach(([txt, t]) => {
      const ln = add(box, `<div style="perspective:700px"></div>`);
      txt.split(" ").forEach((w, i) => {
        const s = add(ln, `<span class="wd">${w}</span>`);
        init(s, { y: 46, autoAlpha: 0, rotationX: -75 });
        go(s, t + i * 0.055, 0.46, { y: 0, autoAlpha: 1, rotationX: 0 }, "back.out(1.5)");
        words.push(s);
      });
    });
    words.forEach((s, i) => go(s, out + i * 0.018, 0.26, { y: -34, autoAlpha: 0 }, "power2.in"));
    return box;
  }

  /* =========================================================
   * CENA 1–2 — a bagunça depois do evento
   * ========================================================= */
  const PILE = [
    [-1420, 380, -14], [-1150, 350, 9], [-1300, 520, -4], [-1050, 500, 16], [-1500, 560, 7], [-1230, 420, -20], [-980, 400, -8],
    [-1380, 470, 12], [-1120, 580, -12], [-1290, 340, 5], [-1460, 440, -6], [-1180, 480, 18], [-1330, 560, -16], [-1240, 450, 3],
  ];
  const cards = PILE.map(([cx, cy, rz], i) => {
    const c = add(pan, `<div class="ph" style="left:${cx - 120}px;top:${cy - 90}px;width:240px;height:180px;transform-origin:50% 50%">${photo(100 + i, { main: i % 3 === 0 ? "lia" : null })}</div>`);
    c._c = { x: cx, y: cy, z: 1 + i * 1.3 };
    init(c, { x: 0, y: 0, z: 430, rotationZ: rz + (i % 2 ? 30 : -30), autoAlpha: 0, scale: 1 });
    const t = 0.12 + i * 0.13;
    go(c, t, 0.12, { autoAlpha: 1 }, "none");
    go(c, t, 0.5, { z: c._c.z, rotationZ: rz }, "power2.in");
    return c;
  });
  camTo(0, 2.8, { fx: -1250, fy: 430, z: -60, tilt: 46, ox: 0, oy: 230 }, "sine.inOut");

  const t1 = add(
    hud,
    `<div id="title1"><div><span class="wd">Depois</span><span class="wd">do</span><span class="wd">evento,</span></div><div><span class="wd">começa</span><span class="wd">o</span><span class="wd">trabalho</span><span class="wd">que</span><span class="u" style="display:inline-block;position:relative"><span class="wd">ninguém</span><span class="wd">vê.</span><svg class="ul" viewBox="0 0 300 22" preserveAspectRatio="none"><path d="M4 15 C 80 5, 200 4, 296 11" stroke="#FFD25A" stroke-width="9" stroke-linecap="round" fill="none"/></svg></span></div></div>`
  );
  t1.querySelectorAll(".wd").forEach((w, i) => {
    init(w, { y: 50, autoAlpha: 0, rotationX: -70 });
    go(w, (i < 3 ? 0.2 : 0.75) + (i < 3 ? i : i - 3) * 0.07, 0.48, { y: 0, autoAlpha: 1, rotationX: 0 }, "back.out(1.5)");
    go(w, 2.72 + i * 0.015, 0.25, { y: -36, autoAlpha: 0 }, "power2.in");
  });
  t1.querySelectorAll(".ul").forEach((u, i) => {
    init(u, { scaleX: 0 });
    go(u, 1.75 + i * 0.16, 0.42, { scaleX: 1 }, "power2.out");
    go(u, 2.78, 0.22, { scaleX: 0 }, "power2.in");
  });
  t1.querySelectorAll("div").forEach((d) => (d.style.perspective = "800px"));

  // pastas e selos "Autorizou?"
  function folderHTML(label) {
    return `<svg width="220" height="170" viewBox="0 0 220 170"><path d="M10 34 Q10 20 24 20 H82 L98 36 H196 Q210 36 210 50 V150 Q210 162 196 162 H24 Q10 162 10 150 Z" fill="#7C93F0"/><path d="M10 58 Q10 46 24 46 H196 Q210 46 210 58 V150 Q210 162 196 162 H24 Q10 162 10 150 Z" fill="#9DB0FF"/><text x="110" y="118" font-family="Inter" font-size="24" font-weight="700" fill="#0F1A3D" text-anchor="middle">${label}</text></svg>`;
  }
  const FA = { x: -1660, y: 770 };
  const FB = { x: -840, y: 770 };
  const folders = [FA, FB].map((f, i) => {
    const e = add(pan, `<div class="folder w" style="left:${f.x - 110}px;top:${f.y - 85}px">${folderHTML(i ? "Turma B" : "Turma A")}</div>`);
    init(e, { z: 2, rotationX: 0, autoAlpha: 0, scale: 1 });
    go(e, 2.95 + i * 0.12, 0.4, { autoAlpha: 1, z: 40, rotationX: -28 }, "back.out(1.4)");
    return e;
  });
  const BADGES = [[3, 3.35], [7, 3.65], [9, 3.95], [5, 4.25], [0, 4.55]];
  const badges = BADGES.map(([ci, t]) => {
    const c = cards[ci];
    const b = add(
      pan,
      `<div class="w" style="left:${c._c.x - 92}px;top:${c._c.y - 70}px;width:184px;height:52px;border-radius:999px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 16px 0 8px;box-shadow:0 14px 30px -12px rgba(15,26,61,.5);font-family:'Bricolage Grotesque';font-weight:800;font-size:22px;color:#0F1A3D"><span style="width:36px;height:36px;border-radius:50%;background:#F26B1D;color:#fff;display:grid;place-items:center;font-size:24px">?</span>Autorizou?</div>`
    );
    init(b, { z: c._c.z + 2, rotationX: 0, scale: 0.4, autoAlpha: 0 });
    go(b, t, 0.38, { z: 70, rotationX: -48, scale: 1, autoAlpha: 1 }, "back.out(1.8)");
    return b;
  });

  camTo(2.8, 0.75, { fx: -1250, fy: 570, z: 260, tilt: 36, ox: 140, oy: 70 });
  camTo(3.55, 1.85, { fx: -1250, fy: 580, z: 320, tilt: 35, ox: 150, oy: 70 }, "none");
  headline([["Foto por foto.", 3.1], ["Quem autorizou?", 4.6]], 5.3);

  // arrastos
  function drag(ci, f, tHover, tPress, tCarry, tDrop) {
    const c = cards[ci];
    const dx = f.x - c._c.x;
    const dy = f.y - c._c.y;
    curTo(tHover, tPress - tHover - 0.08, { x: c._c.x + 26, y: c._c.y + 18, z: c._c.z + 8 });
    click(tPress, { x: c._c.x + 26, y: c._c.y + 18, z: c._c.z + 6 });
    go(c, tPress + 0.05, tCarry - tPress - 0.05, { x: dx * 0.92, y: dy * 0.92 - 30, z: 110, scale: 0.8, rotationZ: 0 }, "power2.inOut");
    curTo(tPress + 0.05, tCarry - tPress - 0.05, { x: f.x + 26 - dx * 0.08, y: f.y + 18 - dy * 0.08 - 30, z: 118 });
    go(c, tCarry, tDrop - tCarry, { x: dx, y: dy, z: 46, scale: 0.35, autoAlpha: 0 }, "power2.in");
    curTo(tCarry, tDrop - tCarry, { x: f.x + 26, y: f.y + 18, z: 60 }, "power2.in");
    const fe = folders[f === FA ? 0 : 1];
    go(fe, tDrop - 0.02, 0.08, { scale: 1.08 }, "power1.out");
    go(fe, tDrop + 0.06, 0.18, { scale: 1 }, "back.out(2)");
  }
  go(cur, 3.05, 0.15, { autoAlpha: 1 }, "none");
  drag(13, FA, 3.1, 3.45, 3.8, 3.95);
  drag(12, FB, 4.0, 4.2, 4.4, 4.5);
  drag(11, FA, 4.55, 4.66, 4.82, 4.9);
  curTo(4.95, 0.35, { x: -1000, y: 640, z: 40 });
  go(cur, 5.25, 0.15, { autoAlpha: 0 }, "none");

  /* =========================================================
   * CENA 3 — a virada: tudo se organiza, a marca aparece
   * ========================================================= */
  const rest = cards.slice(0, 11);
  rest.forEach((c, k) => {
    const col = k % 4;
    const row = Math.floor(k / 4);
    const gx = -1250 + (row === 2 ? col - 1 : col - 1.5) * 268;
    const gy = 430 + (row - 1) * 204;
    go(c, 5.5 + k * 0.025, 0.55, { x: gx - c._c.x, y: gy - c._c.y, z: 2, rotationZ: 0 }, "power3.inOut");
  });
  badges.forEach((b, i) => go(b, 5.45 + i * 0.02, 0.25, { scale: 0.4, autoAlpha: 0 }, "power2.in"));
  folders.forEach((f) => go(f, 5.45, 0.3, { autoAlpha: 0, z: 2 }, "power2.in"));
  camTo(5.4, 0.6, { fx: -1250, fy: 450, z: -320, tilt: 52, ox: 0, oy: 120 }, "power2.out");

  const veil = add(overlay, `<div style="position:absolute;inset:0;background:radial-gradient(48% 42% at 50% 50%, rgba(248,246,241,.96) 0%, rgba(248,246,241,.82) 55%, rgba(248,246,241,0) 100%)"></div>`);
  init(veil, { autoAlpha: 0 });
  go(veil, 5.4, 0.3, { autoAlpha: 1 }, "power1.out");
  go(veil, 6.3, 0.4, { autoAlpha: 0 }, "power1.in");

  function symbol3D(front, sideColor, size) {
    let layers = "";
    for (let i = 14; i >= 1; i--) layers += `<div class="ly" style="background:${sideColor};transform:translateZ(${-i * 2.6}px)"></div>`;
    return `<div class="sym" style="width:${size}px;height:${size}px">${layers}<div class="ly" style="overflow:hidden">${front}</div></div>`;
  }
  const SYM_FRONT = `<img src="assets/aiescola-simbolo.svg" style="width:100%;height:100%;display:block"/>`;
  const logo3 = add(
    overlay,
    `<div id="logo3" style="perspective:1400px;perspective-origin:960px 540px"><div class="symwrap" style="position:absolute;left:520px;top:428px;transform-style:preserve-3d">${symbol3D(SYM_FRONT, "#1a34a6", 224)}</div><img class="wm" src="assets/wordmark-sem-faisca.svg" style="position:absolute;left:776px;top:470px;height:168px"/><div class="spk spark" style="left:${776 + (693 / 3810) * 748 - 26}px;top:${470 + (120 / 855) * 168 - 26}px">${spark(52, "#F26B1D")}</div></div>`
  );
  const symwrap = logo3.querySelector(".symwrap");
  const sym3 = logo3.querySelector(".sym");
  const wm3 = logo3.querySelector(".wm");
  const spk3 = logo3.querySelector(".spk");
  init(logo3, { autoAlpha: 1, scale: 1, y: 0 });
  init(symwrap, { y: -520, rotationY: 60, rotationX: 20, autoAlpha: 0 });
  init(sym3, { rotationY: 0 });
  init(wm3, { clipPath: "inset(0% 100% 0% 0%)", x: -20 });
  init(spk3, { y: -560, rotation: -120, scale: 1.4, autoAlpha: 0 });
  go(symwrap, 5.45, 0.12, { autoAlpha: 1 }, "none");
  go(symwrap, 5.45, 0.5, { y: 0, rotationY: -26, rotationX: 10 }, "back.out(1.3)");
  go(symwrap, 5.95, 0.6, { rotationY: -16, rotationX: 6 }, "sine.inOut");
  go(wm3, 5.6, 0.36, { clipPath: "inset(0% 0% 0% 0%)", x: 0 }, "power3.out");
  go(spk3, 5.78, 0.08, { autoAlpha: 1 }, "none");
  go(spk3, 5.78, 0.3, { y: 0, rotation: 0, scale: 1 }, "power3.in");
  go(spk3, 6.08, 0.07, { scale: 1.35 }, "power1.out");
  sfx("faisca", 6.08);
  go(spk3, 6.15, 0.16, { scale: 1 }, "back.out(2)");
  go(logo3, 6.42, 0.3, { autoAlpha: 0, scale: 0.94, y: -26 }, "power2.in");

  /* =========================================================
   * TELAS DO APP (mundo)
   * ========================================================= */
  const A = screen(
    "scrA",
    0,
    0,
    "Alunos",
    header("Alunos", "Lia Martins", "Infantil 2B · Matrícula 2026-0142", `<span class="btn o sm">${ic("send", 15)} Enviar arte</span><span class="btn sm">Editar cadastro</span>`) +
      `<div class="card" style="left:288px;top:180px;width:496px;height:300px">
        <div class="ct" style="left:24px;top:22px">${ic("user", 18)} Dados do aluno</div>
        <div style="position:absolute;left:24px;top:68px;width:76px;height:76px;border-radius:50%;background:#FFE9A8;overflow:hidden"><svg viewBox="0 0 76 76" width="76" height="76"><circle cx="38" cy="30" r="15" fill="#D9A27A"/><path d="M23 29 A15 15 0 0 1 53 29 Z" fill="#2B1A10"/><circle cx="21" cy="33" r="6" fill="#2B1A10"/><circle cx="55" cy="33" r="6" fill="#2B1A10"/><path d="M14 76 Q14 50 38 50 Q62 50 62 76 Z" fill="#FFD25A"/></svg></div>
        <div style="position:absolute;left:120px;top:72px;font-size:13px;line-height:24px">
          <div><span class="mut">Turma</span>&nbsp; Infantil 2B</div>
          <div><span class="mut">Responsável</span>&nbsp; Carla Martins</div>
          <div style="display:flex;gap:8px;align-items:center"><span class="mut">WhatsApp</span> (11) 9•••• -4821 <span style="font-size:11px;font-weight:600;background:#E9F7EE;color:#17803D;padding:1px 8px;border-radius:999px">Verificado</span></div>
        </div>
        <div style="position:absolute;left:24px;right:24px;top:184px;border-top:1px solid var(--a-border)"></div>
        <div style="position:absolute;left:24px;top:202px;font-size:13px;line-height:22px" class="mut">Cadastrado em 03/02/2026<br/>Fotos de referência: 2</div>
      </div>
      <div class="card" style="left:288px;top:500px;width:496px;height:360px">
        <div class="tabs" style="left:20px;top:20px"><span class="on">Fotos dos eventos</span><span>Rostos de referência</span><span>Artes</span></div>
        <div style="position:absolute;left:0;right:0;top:150px;text-align:center" class="mut">${ic("images", 30, "opacity:.6")}<div style="margin-top:10px;font-size:14px">Nenhuma foto confirmada ainda.</div></div>
      </div>
      <div class="card" style="left:808px;top:700px;width:600px;height:160px">
        <div class="ct" style="left:24px;top:22px;font-size:15px">${ic("clock", 17)} Histórico de autorizações</div>
        <div class="mut" style="position:absolute;left:24px;top:60px;font-size:13px;line-height:21px">Cada registro fica com a data e quem registrou.<br/>Revogar não apaga: entra no histórico.</div>
      </div>`
  );
  const authHTML = `
    <div class="ct" style="left:24px;top:22px">${ic("shield", 19, "color:var(--a-primary)")} Autorizações</div>
    <div class="lbl" style="left:24px;top:70px;font-size:14px;font-weight:600;display:flex;gap:8px;align-items:center">${ic("scan", 17)} Reconhecer o rosto</div>
    <div class="mut" style="position:absolute;left:24px;top:98px;width:440px;font-size:13px;line-height:19px">Separar as fotos do evento por rosto para montar a pasta deste aluno.</div>
    <div class="granted" style="position:absolute;left:24px;top:142px;font-size:12px;color:var(--ok);font-weight:500">Registrada em 10/11/2026 às 14:02 por Coordenação Horizonte.</div>
    <div class="sw" style="left:532px;top:74px"><div class="on"></div><div class="kn"></div></div>
    <div style="position:absolute;left:24px;right:24px;top:174px;border-top:1px solid var(--a-border)"></div>
    <div class="lbl" style="left:24px;top:192px;font-size:14px;font-weight:600;display:flex;gap:8px;align-items:center">${ic("send", 16)} Enviar ao responsável</div>
    <div class="mut" style="position:absolute;left:24px;top:220px;width:310px;font-size:13px;line-height:19px">Enviar as fotos e as artes do aluno ao WhatsApp verificado do responsável.</div>
    <span class="badge b-none bn" style="left:24px;top:286px">Ainda não pedido</span>
    <span class="badge b-wait bw" style="left:24px;top:286px">${ic("clock", 12)} Aguardando resposta</span>
    <span class="badge b-ok bo" style="left:24px;top:286px">${ic("checkc", 12)} Aceito pelo responsável</span>
    <span class="btn sm ask" style="position:absolute;left:340px;top:190px;width:236px">${ic("send", 14)} Pedir aceite ao responsável</span>
    <div style="position:absolute;left:24px;right:24px;top:332px;border-top:1px solid var(--a-border)"></div>
    <div style="position:absolute;left:24px;top:350px;font-size:12px;display:flex;gap:6px;align-items:center;color:var(--ok);font-weight:500">${ic("checkc", 14)} WhatsApp do responsável verificado · (11) 9•••• -4821</div>
    <div style="position:absolute;left:24px;top:384px;width:552px;height:94px;border-radius:10px;background:var(--a-muted);padding:14px 16px 0 44px;font-size:13px;line-height:19px" class="mut"><span style="position:absolute;left:16px;top:15px">${ic("info", 16)}</span>Sem reconhecimento, o rosto não é separado. Sem o aceite do responsável, nada é enviado. Na foto que vai para uma família, as outras crianças saem desfocadas.</div>`;
  const pAuth = piece(A, "pAuth", 808, 180, 600, 500, authHTML);

  const B = screen(
    "scrB",
    1700,
    0,
    "Eventos",
    header("Eventos", "Festa junina 2026", "Educação infantil · 6 turmas · 14/06/2026 · fotos guardadas até 14/12/2026", `<span class="btn o sm">${ic("scan", 15)} Revisar rostos</span><span class="btn o sm">${ic("send", 15)} Entregas</span>`) +
      `<div class="card" style="left:288px;top:488px;width:1120px;height:380px"><div class="ct" style="left:18px;top:14px;font-size:15px">${ic("images", 17)} Fotos do evento</div><div class="grid"></div></div>`
  );
  const dropHTML = `<div style="position:absolute;inset:14px;border:2px dashed hsl(217 40% 80%);border-radius:12px"></div><div class="hot" style="position:absolute;inset:14px;border:2px solid var(--a-primary);border-radius:12px;background:hsl(222 100% 97%)"></div>
    <div style="position:absolute;left:0;right:0;top:78px;text-align:center;color:var(--a-primary)">${ic("upload", 44, "stroke-width:1.6")}</div>
    <div style="position:absolute;left:0;right:0;top:140px;text-align:center;font-size:16px;font-weight:600">Arraste a pasta com as fotos do evento</div>
    <div class="mut" style="position:absolute;left:0;right:0;top:168px;text-align:center;font-size:13px">ou clique para escolher as fotos</div>`;
  const pDrop = piece(B, "pDrop", 288, 184, 520, 280, dropHTML);
  const progHTML = `<div class="ct" style="left:24px;top:22px">${ic("upload", 18)} Envio das fotos</div>
    <div class="lbl" style="left:24px;top:72px">Progresso do envio</div><div class="val vUp" style="right:24px;top:72px">Na fila</div>
    <div class="bar" style="left:24px;top:98px;width:528px"><i class="bUp"></i></div>
    <div class="lbl" style="left:24px;top:132px">Progresso do processamento</div><div class="val vPr" style="right:24px;top:132px">Na fila</div>
    <div class="bar" style="left:24px;top:158px;width:528px"><i class="bPr"></i></div>
    <div class="done" style="position:absolute;left:24px;top:198px;display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600;color:var(--ok)">${ic("checkc", 18)} Todas as 36 fotos processadas</div>
    <div class="mut" style="position:absolute;left:24px;top:232px;font-size:12px">O reconhecimento só usa alunos com a autorização “Reconhecer o rosto”.</div>`;
  const pProg = piece(B, "pProg", 832, 184, 576, 280, progHTML);
  const gridB = B.querySelector(".grid");
  const thumbsB = [];
  for (let k = 0; k < 21; k++) {
    const c = k % 7;
    const r = Math.floor(k / 7);
    const t = add(gridB, `<div class="ph" style="left:${16 + c * 158}px;top:${50 + r * 108}px;width:146px;height:100px;padding:4px;border-radius:9px;box-shadow:none;border:1px solid var(--a-border);transform-origin:50% 50%">${photo(300 + k, { main: k % 4 === 1 ? "lia" : null })}</div>`);
    init(t, { autoAlpha: 0, scale: 0.6 });
    thumbsB.push(t);
  }

  const C = screen(
    "scrC",
    3400,
    0,
    "Eventos",
    header("Festa junina 2026", "Revisão dos rostos", "36 fotos processadas · 12 sugestões para conferir", `<div class="tabs" style="position:static"><span class="on">Sugestões</span><span>Precisa de atenção</span></div>`) +
      `<div class="card" style="left:288px;top:624px;width:780px;height:236px">
        <div class="av" style="position:absolute;left:24px;top:20px;width:40px;height:40px;background:#17803D">DR</div>
        <div style="position:absolute;left:76px;top:20px;font-size:16px;font-weight:600">Davi Rocha</div><div class="mut" style="position:absolute;left:76px;top:43px;font-size:13px">Infantil 2B · 3 fotos sugeridas</div>
        ${[0, 1, 2].map((k) => `<div class="ph" style="left:${24 + k * 184}px;top:80px;width:170px;height:128px;padding:4px;box-shadow:none;border:1px solid var(--a-border)">${photo(520 + k)}</div>`).join("")}
      </div>
      <div class="card" style="left:1088px;top:272px;width:320px;height:330px">
        <div class="ct" style="left:22px;top:20px;font-size:15px">${ic("scan", 17)} Nesta revisão</div>
        ${[["Sugestões pendentes", "12"], ["Confirmadas", "0"], ["Precisa de atenção", "3"], ["Adulto / equipe", "5"]].map(([a, b], i) => `<div style="position:absolute;left:22px;right:22px;top:${70 + i * 52}px;display:flex;justify-content:space-between;font-size:14px;padding-bottom:14px;border-bottom:1px solid var(--a-border)"><span class="mut">${a}</span><b>${b}</b></div>`).join("")}
      </div>`
  );
  const alertHTML = `<div class="alert">${ic("shield", 22, "color:var(--a-primary);margin-top:2px")}<div><div style="font-size:15px;font-weight:600">Quem decide de quem é o rosto é você</div><div class="mut" style="font-size:13px;margin-top:4px">O sistema sugere; a atribuição só existe depois que uma pessoa confirma.</div></div></div>`;
  const pAlert = piece(C, "pAlert", 288, 170, 1120, 84, alertHTML);
  const REV = [
    { seed: 610, main: "lia" },
    { seed: 611, main: "lia" },
    { seed: 612, main: "look" },
    { seed: 613, main: "lia" },
  ];
  const cardHTML =
    `<div class="av" style="position:absolute;left:24px;top:20px;width:40px;height:40px;background:#FFD25A;color:#0F1A3D">LM</div>
    <div style="position:absolute;left:76px;top:20px;font-size:16px;font-weight:600">Lia Martins</div><div class="mut" style="position:absolute;left:76px;top:43px;font-size:13px">Infantil 2B · 4 fotos sugeridas</div>
    <div style="position:absolute;right:24px;top:30px;font-size:13px;font-weight:600;color:var(--a-primary)">Selecionar todas</div>` +
    REV.map(
      (r, k) =>
        `<div class="ph rv rv${k}" style="left:${24 + k * 184}px;top:80px;width:170px;height:128px;padding:4px;box-shadow:none;border:1px solid var(--a-border)">${photo(r.seed, { main: r.main, rings: true, count: 3 })}</div><div class="cb cbon cb${k}" style="left:${32 + k * 184}px;top:88px">${ic("check", 15, "stroke-width:3")}</div><div class="cb off cboff${k}" style="left:${32 + k * 184}px;top:88px"></div>`
    ).join("") +
    `<div class="mut foot1" style="position:absolute;left:24px;top:262px;font-size:13px">Confira os rostos antes de confirmar.</div>
    <span class="btn conf" style="position:absolute;left:586px;top:252px;width:170px"><span class="c4">Confirmar 4 fotos</span></span>
    <span class="btn conf3" style="position:absolute;left:586px;top:252px;width:170px">Confirmar 3 fotos</span>
    <div class="okbar" style="position:absolute;left:16px;right:16px;top:240px;height:60px;border-radius:10px;background:var(--ok-bg);color:var(--ok);display:flex;align-items:center;gap:10px;padding:0 16px;font-size:15px;font-weight:600">${ic("checkc", 20)} 3 fotos confirmadas para Lia Martins</div>`;
  const pCard = piece(C, "pCard", 288, 272, 780, 330, cardHTML);

  const D = screen(
    "scrD",
    5100,
    0,
    "Eventos",
    header("Festa junina 2026", "Entregas aos responsáveis", "Confira as fotos e a mensagem antes de aprovar.") +
      `<div class="card" style="left:288px;top:180px;width:300px;height:340px">
        <div class="ct" style="left:24px;top:22px;font-size:15px">Etapas da entrega</div>
        <div class="stepline" style="top:74px"><span class="num ok">${ic("check", 15, "stroke-width:3")}</span>1. Preparar fotos</div>
        <div class="stepline" style="top:130px"><span class="num cur s2a">2</span><span class="num ok s2b" style="position:absolute;left:0">${ic("check", 15, "stroke-width:3")}</span>2. Conferir e aprovar</div>
        <div class="stepline" style="top:186px"><span class="num s3a">3</span><span class="num cur s3b" style="position:absolute;left:0">3</span>3. Enviar acesso ao álbum</div>
        <div class="mut" style="position:absolute;left:24px;right:24px;top:246px;font-size:12px;line-height:18px">Aprovar não envia. O envio confere de novo o número, as autorizações e as fotos.</div>
      </div>
      <div class="card" style="left:612px;top:180px;width:796px;height:134px">
        <div class="av" style="position:absolute;left:24px;top:24px;width:40px;height:40px;background:#2447D6">CM</div>
        <div style="position:absolute;left:76px;top:24px;font-size:16px;font-weight:600">Carla Martins</div>
        <div class="mut" style="position:absolute;left:76px;top:47px;font-size:13px">(11) 9•••• -4821 · responsável de Lia Martins</div>
        <div style="position:absolute;left:76px;top:80px;font-size:12px;font-weight:600;color:var(--ok);display:flex;gap:6px;align-items:center">${ic("checkc", 14)} Aceito pelo responsável · 3 fotos confirmadas</div>
        ${[0, 1, 3].map((k, i) => `<div class="ph" style="left:${470 + i * 104}px;top:24px;width:96px;height:72px;padding:3px;box-shadow:none;border:1px solid var(--a-border);border-radius:8px">${photo(REV[k].seed, { main: "lia", count: 3 })}</div>`).join("")}
      </div>`
  );
  const MSG = `<b>Festa junina 2026</b>\nSeparamos as fotos da festa para vocês.\nEscola Horizonte\nAcesse seu álbum pelo link exclusivo: [link exclusivo gerado pelo sistema]\nO mesmo link abre de novo enquanto as fotos continuarem disponíveis. A escola pode revogar o acesso.`;
  const prevHTML = `<div class="ct" style="left:24px;top:20px;font-size:15px">2. Mensagem para as famílias</div>
    <div class="mut" style="position:absolute;left:24px;top:52px;font-size:13px;display:flex;gap:6px;align-items:center">${ic("phone", 14)} É assim que a família recebe a mensagem</div>
    <div class="msgbox" style="left:24px;top:80px;width:748px">${MSG}</div>
    <div class="mut" style="position:absolute;left:24px;top:262px;font-size:12px">O link do álbum será criado no envio. As fotos ficam dentro do álbum privado.</div>`;
  const pPrev = piece(D, "pPrev", 612, 330, 796, 296, prevHTML);
  const actHTML = `<div class="st1" style="position:absolute;inset:0">
      <div style="position:absolute;left:24px;top:18px;font-size:15px;font-weight:600">3. Aprovar o álbum</div>
      <div class="mut" style="position:absolute;left:24px;top:42px;font-size:13px">Versão 1 · ainda não aprovada.</div>
      <div class="cb off ck0" style="left:24px;top:72px;width:20px;height:20px"></div><div class="cb ck1" style="left:24px;top:72px;width:20px;height:20px">${ic("check", 13, "stroke-width:3")}</div>
      <div style="position:absolute;left:54px;top:73px;font-size:13px">Conferi as fotos, a mensagem e os responsáveis que vão receber.</div>
      <span class="btn apr" style="position:absolute;left:582px;top:34px;width:190px">${ic("checkc", 16)} Aprovar esta versão</span>
    </div>
    <div class="st2" style="position:absolute;inset:0">
      <div style="position:absolute;left:24px;top:18px;font-size:15px;font-weight:600">Envio e acesso ao álbum</div>
      <div class="mut" style="position:absolute;left:24px;top:42px;width:520px;font-size:13px;line-height:19px">Versão 1 aprovada. O envio confere de novo o número, as autorizações e as fotos.</div>
      <span class="btn snd" style="position:absolute;left:572px;top:34px;width:200px">${ic("send", 15)} Enviar texto e link</span>
    </div>`;
  const pAct = piece(D, "pAct", 612, 646, 796, 110, actHTML);

  /* =========================================================
   * CELULAR
   * ========================================================= */
  let edges = "";
  for (let i = 12; i >= 1; i--) edges += `<div class="edge" style="transform:translateZ(${-i * 2}px)"></div>`;
  phone.innerHTML =
    edges +
    `<div class="front"><div class="scr"><div class="island"></div>
      <div class="pane chat">
        <div class="wa-head"><div class="stat" style="color:#fff"><span>14:03</span><span style="display:flex;gap:6px">${ic("bell", 15)}${ic("lock", 15)}</span></div>
          <div class="row">${ic("chevleft", 26)}<div class="wa-av"><img src="assets/aiescola-simbolo.svg" style="width:40px;height:40px"/></div><div style="flex:1;line-height:18px"><div style="font-size:17px;font-weight:600">AIESCOLA</div><div style="font-size:12.5px;opacity:.85">Conta comercial</div></div>${ic("video", 22)}${ic("phone", 20)}${ic("dots", 20)}</div></div>
        <div class="wa-body"><div class="wa-date">HOJE</div>
          <div class="bub b1" style="top:52px">Acesse este link para revisar a solicitação da AIESCOLA: <a class="lk1">aiescola.com.br/consentimento/7Hk2pQ</a><span class="tm">14:03</span></div>
          <div class="bub b2" style="top:168px"><b>Festa junina 2026</b><br/>Separamos as fotos da festa para vocês.<br/>Escola Horizonte<br/><br/>Acesse seu álbum pelo link exclusivo: <a class="lk2">aiescola.com.br/album/Lm93xQ</a><br/><br/>O mesmo link abre de novo enquanto as fotos continuarem disponíveis. A escola pode revogar o acesso.<span class="tm">18:42</span></div>
        </div>
        <div class="wa-in"><div class="f">${ic("smile", 22)}<span style="flex:1">Mensagem</span>${ic("paperclip", 20)}${ic("camera", 20)}</div><div class="m">${ic("mic", 22)}</div></div>
      </div>
      <div class="pane consent" style="background:#F8FAFC">
        <div class="stat"><span>14:04</span><span style="display:flex;gap:6px">${ic("bell", 15)}${ic("lock", 15)}</span></div>
        <div class="url">${ic("lock", 13)} aiescola.com.br</div>
        <img src="assets/aiescola-logo.svg" style="position:absolute;left:50%;top:112px;height:26px;transform:translateX(-50%)"/>
        <div class="cbox" style="position:absolute;left:16px;right:16px;top:156px;height:560px;background:#fff;border:1px solid var(--a-border);border-radius:16px;padding:20px 18px">
          <div style="display:flex;gap:8px;align-items:center;font-size:17px;font-weight:600">${ic("shield", 20, "color:var(--a-primary)")} Autorização de envio</div>
          <p style="margin-top:14px;font-size:15px;line-height:22px">Olá, Carla. <b>Escola Horizonte</b> pediu sua autorização para enviar por WhatsApp as fotos em que Lia aparece.</p>
          <p class="mut" style="margin-top:12px;font-size:13px;line-height:19px">A escola separa as fotos do evento por reconhecimento facial e confere cada uma antes de enviar.</p>
          <p class="mut" style="margin-top:8px;font-size:13px;line-height:19px">Você pode retirar a autorização quando quiser, falando com a escola.</p>
          <p class="mut" style="margin-top:14px;font-size:11.5px;line-height:17px">Termo v1 · este link vale até 17/11/2026 14:03. Link privado e de uso único: não compartilhe.</p>
          <span class="btn yes" style="position:absolute;left:18px;right:18px;top:400px;height:48px;font-size:16px">${ic("checkc", 18)} Autorizar envio</span>
          <span class="btn o" style="position:absolute;left:18px;right:18px;top:460px;height:48px;font-size:16px">Não autorizar</span>
        </div>
        <div class="cok" style="position:absolute;left:16px;right:16px;top:156px;height:300px;background:#fff;border:1px solid var(--a-border);border-radius:16px;padding:28px 22px;text-align:center">
          <div style="width:64px;height:64px;border-radius:50%;background:var(--ok-bg);color:var(--ok);display:grid;place-items:center;margin:8px auto 0">${ic("checkc", 34)}</div>
          <div style="margin-top:18px;font-size:19px;font-weight:700">Autorização registrada</div>
          <p class="mut" style="margin-top:10px;font-size:14px;line-height:20px">Você já autorizou este envio. Para revogar, fale com a escola.</p>
        </div>
      </div>
      <div class="pane album" style="background:#F8FAFC">
        <div class="stat"><span>18:43</span><span style="display:flex;gap:6px">${ic("bell", 15)}${ic("lock", 15)}</span></div>
        <div class="url">${ic("lock", 13)} aiescola.com.br</div>
        <div style="position:absolute;left:18px;top:106px;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--a-mutedfg)">AIESCOLA · ÁLBUM PRIVADO</div>
        <div style="position:absolute;left:18px;top:126px;font-size:25px;font-weight:700;letter-spacing:-.01em">Festa junina 2026</div>
        <div class="mut" style="position:absolute;left:18px;top:160px;font-size:14px">Escola Horizonte</div>
        <div style="position:absolute;left:16px;right:16px;top:192px;height:114px;background:#fff;border:1px solid var(--a-border);border-radius:14px">
          <div class="mut" style="position:absolute;left:16px;top:14px;font-size:12.5px">Sessão deste navegador até 24/11/2026.</div>
          <span class="btn zipb" style="position:absolute;left:16px;right:16px;top:50px;height:46px;font-size:15px">${ic("download", 17)} Baixar estas (3)</span>
        </div>
        <div style="position:absolute;left:18px;top:322px;font-size:15px;font-weight:600">Festa junina 2026</div>
        ${[0, 1, 3]
          .map((k, i) => {
            const x = i === 2 ? 16 : 16 + i * 178;
            const y = i === 2 ? 520 : 352;
            return `<div class="aph aph${i}" style="position:absolute;left:${x}px;top:${y}px;width:166px"><div class="ph" style="position:relative;width:166px;height:125px;padding:0;border-radius:10px;overflow:hidden;box-shadow:none">${photo(REV[k].seed, { main: "lia", blur: true, count: 3 })}</div><span class="btn o sm" style="margin-top:6px;width:166px;height:30px;font-size:12px">${ic("download", 13)} Baixar foto ${i + 1}</span></div>`;
          })
          .join("")}
        <div class="zipn" style="position:absolute;left:16px;right:16px;top:716px;height:50px;border-radius:12px;background:#0F1A3D;color:#fff;display:flex;align-items:center;gap:10px;padding:0 16px;font-size:14px;font-weight:500"><span class="z1" style="position:absolute;left:16px">Preparando o ZIP: 2 de 3 fotos…</span><span class="z2" style="position:absolute;left:16px;display:flex;gap:8px;align-items:center">${ic("checkc", 17, "color:#7CE0A0")} 3 fotos no ZIP.</span></div>
      </div>
      <div class="touch"></div>
    </div></div>`;
  const PH = { chat: phone.querySelector(".chat"), consent: phone.querySelector(".consent"), album: phone.querySelector(".album") };
  const touch = phone.querySelector(".touch");
  init(phone, { x: 760, y: 0, z: 0, rotationY: -60, rotationX: 6, scale: 1.14, autoAlpha: 0 });
  init(PH.consent, { x: 376 });
  init(PH.album, { x: 376 });
  init(touch, { x: 188, y: 600, scale: 1, autoAlpha: 0 });
  const b1 = phone.querySelector(".b1");
  const b2 = phone.querySelector(".b2");
  init(b1, { autoAlpha: 0, scale: 0.85, y: 14 });
  init(b2, { autoAlpha: 0, scale: 0.85, y: 14 });
  b1.style.transformOrigin = "0 0";
  b2.style.transformOrigin = "0 0";
  const cbox = PH.consent.querySelector(".cbox");
  const cok = PH.consent.querySelector(".cok");
  init(cbox, { autoAlpha: 1 });
  init(cok, { autoAlpha: 0, scale: 0.94 });
  const aphs = [0, 1, 2].map((i) => PH.album.querySelector(".aph" + i));
  aphs.forEach((a) => init(a, { autoAlpha: 0, y: 18 }));
  const zipn = PH.album.querySelector(".zipn");
  const z1 = PH.album.querySelector(".z1");
  const z2 = PH.album.querySelector(".z2");
  init(zipn, { autoAlpha: 0, y: 20 });
  init(z1, { autoAlpha: 1 });
  init(z2, { autoAlpha: 0 });

  function tap(at, x, y) {
    sfx("toque", at);
    go(touch, at - 0.26, 0.22, { x, y, autoAlpha: 0.95 }, "power2.inOut");
    go(touch, at, 0.07, { scale: 0.72 }, "power1.in");
    go(touch, at + 0.07, 0.22, { scale: 1.15, autoAlpha: 0 }, "power2.out");
    setAt(touch, at + 0.3, { scale: 1 });
  }
  function waChip(at, from, to) {
    const c = add(overlay, `<div class="wachip" style="left:-48px;top:-48px">${wa(58)}</div>`);
    init(c, { x: from.x, y: from.y, scale: 0.3, rotation: -20, autoAlpha: 0 });
    go(c, at, 0.14, { autoAlpha: 1, scale: 1.05, rotation: 0 }, "back.out(2)");
    go(c, at + 0.14, 0.5, { x: to.x }, "power2.inOut");
    go(c, at + 0.14, 0.5, { y: to.y, scale: 0.55 }, "power3.in");
    go(c, at + 0.6, 0.1, { autoAlpha: 0 }, "none");
  }

  /* =========================================================
   * CENA 4 — autorização (ficha do aluno + WhatsApp + aceite)
   * ========================================================= */
  camTo(6.1, 1.05, { fx: 1108, fy: 420, z: 540, tilt: 20, ox: -230, oy: 175 });
  camTo(7.15, 4.0, { fx: 1108, fy: 420, z: 590, tilt: 18, ox: -230, oy: 175 }, "none");
  headline([["Uma autorização", 6.95], ["para cada uso.", 7.2]], 11.15);
  lift(pAuth, 7.0, 0.5, 60, 8);
  const sw = pAuth.el.querySelector(".sw");
  const swOn = sw.querySelector(".on");
  const swKn = sw.querySelector(".kn");
  const granted = pAuth.el.querySelector(".granted");
  const bn = pAuth.el.querySelector(".bn");
  const bw = pAuth.el.querySelector(".bw");
  const bo = pAuth.el.querySelector(".bo");
  const ask = pAuth.el.querySelector(".ask");
  init(swOn, { autoAlpha: 0 });
  init(swKn, { x: 0 });
  init(granted, { autoAlpha: 0, y: 6 });
  init(bn, { autoAlpha: 1 });
  init(bw, { autoAlpha: 0 });
  init(bo, { autoAlpha: 0, scale: 1 });
  const pSw = onP(pAuth, 556, 90);
  const pAsk = onP(pAuth, 470, 210);
  setAt(cur, 7.3, Object.assign(onP(pAuth, 420, 150), { scale: 1.25 }));
  go(cur, 7.35, 0.15, { autoAlpha: 1 }, "none");
  curTo(7.4, 0.38, pSw);
  click(7.85, pSw);
  go(swOn, 7.86, 0.16, { autoAlpha: 1 }, "power1.out");
  go(swKn, 7.86, 0.2, { x: 20 }, "back.out(2)");
  go(granted, 7.95, 0.25, { autoAlpha: 1, y: 0 }, "power2.out");
  curTo(8.05, 0.32, pAsk);
  click(8.45, pAsk);
  press(ask, 8.45);
  swap(bn, bw, 8.52);
  sfx("tic", 8.52);
  const chipFrom = project(pAsk.x, pAsk.y, pAsk.z, { fx: 1108, fy: 420, z: 557, tilt: 19.3, ox: -230, oy: 175 });
  waChip(8.5, chipFrom, { x: 1560, y: 300 });
  // celular entra
  go(phone, 8.55, 0.08, { autoAlpha: 1 }, "none");
  go(phone, 8.55, 0.6, { x: 0, rotationY: -16, rotationX: 4 }, "power3.out");
  go(b1, 9.12, 0.32, { autoAlpha: 1, scale: 1, y: 0 }, "back.out(1.7)");
  sfx("mensagem", 9.12);
  tap(9.62, 150, 116 + 52 + 52);
  go(PH.consent, 9.74, 0.32, { x: 0 }, "power3.out");
  tap(10.36, 188, 156 + 400 + 24);
  press(PH.consent.querySelector(".yes"), 10.36);
  go(cbox, 10.48, 0.16, { autoAlpha: 0 }, "power1.out");
  go(cok, 10.5, 0.3, { autoAlpha: 1, scale: 1 }, "back.out(1.6)");
  swap(bw, bo, 10.74);
  sfx("tic", 10.74);
  go(bo, 10.74, 0.12, { scale: 1.12 }, "power1.out");
  go(bo, 10.86, 0.2, { scale: 1 }, "back.out(2)");
  // saída
  go(cur, 11.15, 0.15, { autoAlpha: 0 }, "none");
  go(phone, 11.2, 0.5, { x: 820, rotationY: -55 }, "power3.in");
  go(phone, 11.7, 0.01, { autoAlpha: 0 }, "none");
  go(PH.consent, 11.8, 0.01, { x: 376 }, "none");
  lift(pAuth, 11.25, 0.4, 1, 0, "power2.inOut");

  /* =========================================================
   * CENA 5 — envio do evento inteiro
   * ========================================================= */
  camTo(11.3, 0.95, { fx: 1700 + 848, fy: 470, z: 300, tilt: 24, ox: 240, oy: 215 });
  camTo(12.25, 2.0, { fx: 1700 + 848, fy: 470, z: 340, tilt: 23, ox: 240, oy: 215 }, "none");
  headline([["O evento inteiro,", 12.0], ["de uma vez.", 12.22]], 14.1);
  lift(pDrop, 12.0, 0.4, 40, 7);
  lift(pProg, 12.1, 0.4, 30, 7);
  const hot = pDrop.el.querySelector(".hot");
  init(hot, { autoAlpha: 0 });
  const fold = add(
    pan,
    `<div class="w" style="left:${1700 + 548 - 110}px;top:${980 - 85}px;width:220px;height:170px">${folderHTML("Festa junina")}<div style="position:absolute;right:-6px;top:-10px;background:#0F1A3D;color:#fff;font-size:15px;font-weight:700;padding:3px 10px;border-radius:999px">36 fotos</div></div>`
  );
  init(fold, { x: 0, y: 0, z: 150, rotationX: -20, scale: 1, autoAlpha: 0 });
  const dropC = onP(pDrop, 260, 140);
  setAt(cur, 12.15, { x: 1700 + 548 + 20, y: 980 + 10, z: 160, rotationX: -20, scale: 1.25 });
  go(cur, 12.2, 0.12, { autoAlpha: 1 }, "none");
  go(fold, 12.2, 0.12, { autoAlpha: 1 }, "none");
  const fdx = dropC.x - (1700 + 548);
  const fdy = dropC.y - 980;
  go(fold, 12.3, 0.55, { x: fdx, y: fdy - 30, z: dropC.z + 70, rotationX: -8 }, "power3.inOut");
  curTo(12.3, 0.55, { x: dropC.x + 20, y: dropC.y - 20, z: dropC.z + 80, rotationX: -8 }, "power3.inOut");
  go(hot, 12.6, 0.2, { autoAlpha: 1 }, "power1.out");
  go(fold, 12.88, 0.16, { y: fdy, z: dropC.z + 4, scale: 0.4, autoAlpha: 0 }, "power2.in");
  click(12.9, dropC);
  go(hot, 13.1, 0.5, { autoAlpha: 0 }, "power1.in");
  go(cur, 13.3, 0.3, { autoAlpha: 0, y: dropC.y + 120 }, "power2.in");
  thumbsB.forEach((t, k) => go(t, 13.0 + k * 0.032, 0.32, { autoAlpha: 1, scale: 1 }, "back.out(1.7)"));
  const bUp = pProg.el.querySelector(".bUp");
  const bPr = pProg.el.querySelector(".bPr");
  const done = pProg.el.querySelector(".done");
  init(bUp, { scaleX: 0 });
  init(bPr, { scaleX: 0 });
  init(done, { autoAlpha: 0, y: 8 });
  go(bUp, 12.98, 0.6, { scaleX: 1 }, "power1.inOut");
  go(bPr, 13.2, 0.75, { scaleX: 1 }, "power1.inOut");
  counter(pProg.el.querySelector(".vUp"), 12.98, 0.6, 0, 36, (v) => (v >= 36 ? "36 enviadas" : v <= 0 ? "Na fila" : `Enviando ${v} de 36…`));
  counter(pProg.el.querySelector(".vPr"), 13.2, 0.75, 0, 36, (v) => (v <= 0 ? "Na fila" : `Processadas ${v} de 36`));
  go(done, 13.98, 0.3, { autoAlpha: 1, y: 0 }, "back.out(1.6)");
  sfx("tic", 13.98);
  lift(pDrop, 14.15, 0.35, 1, 0, "power2.inOut");
  lift(pProg, 14.2, 0.35, 1, 0, "power2.inOut");

  /* =========================================================
   * CENA 6 — a IA sugere, a escola confere
   * ========================================================= */
  camTo(14.25, 0.95, { fx: 3400 + 678, fy: 400, z: 540, tilt: 16, ox: 240, oy: 205 });
  camTo(15.2, 4.3, { fx: 3400 + 678, fy: 400, z: 590, tilt: 15, ox: 240, oy: 205 }, "none");
  headline([["A IA sugere.", 14.9], ["A escola confere.", 17.6]], 19.35);
  lift(pAlert, 14.95, 0.4, 34, 6);
  lift(pCard, 15.25, 0.45, 70, 7);
  lift(pAlert, 16.0, 0.4, 1, 0, "power2.inOut");
  const rvs = REV.map((r, k) => pCard.el.querySelector(".rv" + k));
  const rai = rvs.map((r) => r.querySelector(".rai"));
  const rok = rvs.map((r) => r.querySelector(".rok"));
  rai.forEach((g) => init(g, { opacity: 0 }));
  rok.forEach((g) => init(g, { opacity: 0 }));
  const cbon = REV.map((r, k) => pCard.el.querySelector(".cb" + k));
  const cboff = REV.map((r, k) => pCard.el.querySelector(".cboff" + k));
  cbon.forEach((c) => init(c, { autoAlpha: 1 }));
  cboff.forEach((c) => init(c, { autoAlpha: 0 }));
  rvs.forEach((r) => init(r, { opacity: 1 }));
  const c4 = pCard.el.querySelector(".conf");
  const c3 = pCard.el.querySelector(".conf3");
  const okbar = pCard.el.querySelector(".okbar");
  const foot1 = pCard.el.querySelector(".foot1");
  init(c4, { autoAlpha: 1, scale: 1 });
  init(c3, { autoAlpha: 0, scale: 1 });
  init(okbar, { autoAlpha: 0, y: 10 });
  init(foot1, { autoAlpha: 1 });
  // faísca percorre as fotos
  const spw = add(pan, `<div class="spark" style="left:0;top:0">${spark(44, "#F26B1D")}</div>`);
  const sp0 = onP(pCard, 0, 150);
  init(spw, { x: sp0.x - 22, y: sp0.y - 22, z: sp0.z + 30, rotationX: sp0.rotationX, rotation: 0, scale: 0, autoAlpha: 0 });
  go(spw, 15.55, 0.15, { scale: 1, autoAlpha: 1 }, "back.out(2)");
  REV.forEach((r, k) => {
    const p = onP(pCard, 24 + k * 184 + 85, 115);
    go(spw, 15.62 + k * 0.22, 0.2, { x: p.x - 22, y: p.y - 22, z: p.z + 30, rotation: 90 * (k + 1) }, "power2.inOut");
    go(rai[k], 15.78 + k * 0.22, 0.18, { opacity: 1 }, "power1.out");
  });
  go(spw, 16.55, 0.2, { scale: 0, autoAlpha: 0 }, "power2.in");
  // a escola corrige a sugestão errada
  const pCb2 = onP(pCard, 32 + 2 * 184 + 12, 88 + 12);
  const pConf = onP(pCard, 671, 270);
  setAt(cur, 16.55, Object.assign(onP(pCard, 700, 320), { scale: 1.25 }));
  go(cur, 16.6, 0.15, { autoAlpha: 1 }, "none");
  curTo(16.65, 0.42, pCb2);
  click(17.15, pCb2);
  swap(cbon[2], cboff[2], 17.16, 0.1);
  go(rvs[2], 17.18, 0.25, { opacity: 0.4 }, "power1.out");
  go(rai[2], 17.18, 0.2, { opacity: 0 }, "power1.out");
  swap(c4, c3, 17.24, 0.12);
  curTo(17.45, 0.4, pConf);
  click(17.95, pConf);
  press(c3, 17.95);
  [0, 1, 3].forEach((k, i) => {
    go(rai[k], 18.05 + i * 0.05, 0.15, { opacity: 0 }, "power1.out");
    go(rok[k], 18.05 + i * 0.05, 0.2, { opacity: 1 }, "power1.out");
  });
  go(c3, 18.3, 0.18, { autoAlpha: 0 }, "power1.in");
  go(foot1, 18.3, 0.18, { autoAlpha: 0 }, "power1.in");
  go(okbar, 18.36, 0.3, { autoAlpha: 1, y: 0 }, "back.out(1.6)");
  sfx("tic", 18.05);
  go(cur, 19.1, 0.2, { autoAlpha: 0 }, "none");
  lift(pCard, 19.4, 0.4, 1, 0, "power2.inOut");

  /* =========================================================
   * CENA 7 — a escola aprova, a família recebe no WhatsApp
   * ========================================================= */
  camTo(19.55, 0.95, { fx: 5100 + 1010, fy: 600, z: 450, tilt: 18, ox: 80, oy: 215 });
  camTo(20.5, 1.65, { fx: 5100 + 1010, fy: 600, z: 480, tilt: 17, ox: 80, oy: 215 }, "none");
  headline([["A escola aprova.", 20.15]], 21.95);
  lift(pPrev, 20.25, 0.42, 40, 6);
  lift(pAct, 20.5, 0.4, 64, 7);
  const st1 = pAct.el.querySelector(".st1");
  const st2 = pAct.el.querySelector(".st2");
  const ck0 = pAct.el.querySelector(".ck0");
  const ck1 = pAct.el.querySelector(".ck1");
  init(st1, { autoAlpha: 1, y: 0 });
  init(st2, { autoAlpha: 0, y: 14 });
  init(ck0, { autoAlpha: 1 });
  init(ck1, { autoAlpha: 0 });
  const s2a = D.querySelector(".s2a");
  const s2b = D.querySelector(".s2b");
  const s3a = D.querySelector(".s3a");
  const s3b = D.querySelector(".s3b");
  init(s2a, { autoAlpha: 1 });
  init(s2b, { autoAlpha: 0 });
  init(s3a, { autoAlpha: 1 });
  init(s3b, { autoAlpha: 0 });
  const pCk = onP(pAct, 36, 84);
  const pApr = onP(pAct, 677, 54);
  const pSnd = onP(pAct, 672, 54);
  setAt(cur, 20.7, Object.assign(onP(pAct, 330, 130), { scale: 1.25 }));
  go(cur, 20.75, 0.15, { autoAlpha: 1 }, "none");
  curTo(20.8, 0.32, pCk);
  click(21.15, pCk);
  swap(ck0, ck1, 21.16, 0.1);
  curTo(21.25, 0.3, pApr);
  click(21.6, pApr);
  press(pAct.el.querySelector(".apr"), 21.6);
  swap(s2a, s2b, 21.7);
  sfx("tic", 21.7);
  swap(s3a, s3b, 21.75);
  go(st1, 21.78, 0.18, { autoAlpha: 0, y: -12 }, "power2.in");
  go(st2, 21.86, 0.24, { autoAlpha: 1, y: 0 }, "power2.out");
  curTo(21.98, 0.18, { x: pSnd.x + 6, y: pSnd.y + 4, z: pSnd.z, rotationX: pSnd.rotationX });
  click(22.25, pSnd);
  press(pAct.el.querySelector(".snd"), 22.25);
  const chip2 = project(pSnd.x, pSnd.y, pSnd.z, { fx: 6110, fy: 600, z: 480, tilt: 17, ox: 80, oy: 215 });
  waChip(22.32, chip2, { x: 1440, y: 360 });
  go(cur, 22.5, 0.15, { autoAlpha: 0 }, "none");
  camTo(22.2, 0.85, { fx: 5100 + 900, fy: 500, z: 160, tilt: 26, ox: -420, oy: 150 });
  camTo(23.05, 2.1, { fx: 5100 + 900, fy: 500, z: 120, tilt: 27, ox: -440, oy: 150 }, "none");
  headline([["A família recebe", 22.55], ["no WhatsApp.", 22.8]], 25.0);
  go(phone, 22.42, 0.08, { autoAlpha: 1 }, "none");
  go(phone, 22.42, 0.62, { x: -140, rotationY: -14, rotationX: 3 }, "power3.out");
  go(b2, 23.02, 0.34, { autoAlpha: 1, scale: 1, y: 0 }, "back.out(1.6)");
  sfx("mensagem", 23.02);
  tap(23.6, 170, 116 + 168 + 128);
  go(PH.album, 23.72, 0.32, { x: 0 }, "power3.out");
  aphs.forEach((a, i) => go(a, 24.0 + i * 0.08, 0.3, { autoAlpha: 1, y: 0 }, "back.out(1.6)"));
  tap(24.45, 188, 192 + 50 + 23);
  press(PH.album.querySelector(".zipb"), 24.45);
  go(zipn, 24.55, 0.25, { autoAlpha: 1, y: 0 }, "back.out(1.6)");
  swap(z1, z2, 24.9);
  sfx("tic", 24.9);

  /* =========================================================
   * CENA 8 — fecho
   * ========================================================= */
  go(phone, 25.15, 0.65, { x: -600, rotationY: 0, rotationX: 0, scale: 1.04 }, "power3.inOut");
  const flood = add(endcard, `<div id="flood"></div>`);
  const FW = 376 * 1.04;
  const FH = 796 * 1.04;
  init(flood, { left: 960 - FW / 2, top: 530 - FH / 2, width: FW, height: FH, borderRadius: 56, autoAlpha: 0 });
  go(flood, 25.62, 0.14, { autoAlpha: 1 }, "power1.out");
  go(flood, 25.8, 0.5, { left: -40, top: -40, width: 2000, height: 1160, borderRadius: 0 }, "power3.inOut");
  const SYM_W = `<svg viewBox="0 0 64 64" width="100%" height="100%" style="display:block"><rect width="64" height="64" rx="18" fill="#fff"/><path d="M32 13L14 50M32 13L50 50" stroke="#2447D6" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path fill="#F26B1D" d="M32 30Q33 37 39 38Q33 39 32 46Q31 39 25 38Q31 37 32 30Z"/></svg>`;
  const WM_H = 150;
  const WM_W = (WM_H * 3810) / 855;
  const SYM_S = 200;
  const startX = (1920 - (SYM_S + 34 + WM_W)) / 2;
  const end = add(
    endcard,
    `<div style="position:absolute;inset:0;perspective:1400px;perspective-origin:960px 420px"><div class="esw" style="position:absolute;left:${startX}px;top:268px;transform-style:preserve-3d">${symbol3D(SYM_W, "#c4cff5", SYM_S)}</div><img class="ewm" src="assets/wordmark-branco-sem-faisca.svg" style="position:absolute;left:${startX + SYM_S + 34}px;top:296px;height:${WM_H}px"/><div class="esp spark" style="left:${startX + SYM_S + 34 + (693 / 3810) * WM_W - 24}px;top:${296 + (120 / 855) * WM_H - 24}px">${spark(48, "#FFD25A")}</div></div>`
  );
  add(endcard, `<div class="slog">${"Fotos da escola, entregues a cada família.".split(" ").map((w) => `<span class="wd">${w}</span>`).join("")}</div>`);
  add(endcard, `<div class="cta"><div class="pill">Agende uma demonstração</div></div>`);
  add(endcard, `<div class="site">aiescola.com.br</div>`);
  const esw = end.querySelector(".esw");
  const ewm = end.querySelector(".ewm");
  const esp = end.querySelector(".esp");
  init(esw, { y: -460, rotationY: 70, rotationX: 18, autoAlpha: 0 });
  init(ewm, { clipPath: "inset(0% 100% 0% 0%)", x: -20 });
  init(esp, { y: -520, rotation: -120, scale: 1.4, autoAlpha: 0 });
  go(esw, 26.1, 0.1, { autoAlpha: 1 }, "none");
  go(esw, 26.1, 0.55, { y: 0, rotationY: -24, rotationX: 8 }, "back.out(1.3)");
  go(esw, 26.65, 4.7, { rotationY: -12, rotationX: 4 }, "sine.inOut");
  go(ewm, 26.3, 0.38, { clipPath: "inset(0% 0% 0% 0%)", x: 0 }, "power3.out");
  go(esp, 26.52, 0.08, { autoAlpha: 1 }, "none");
  go(esp, 26.52, 0.3, { y: 0, rotation: 0, scale: 1 }, "power3.in");
  go(esp, 26.82, 0.07, { scale: 1.35 }, "power1.out");
  sfx("faisca", 26.82);
  go(esp, 26.89, 0.16, { scale: 1 }, "back.out(2)");
  endcard.querySelectorAll(".slog .wd").forEach((w, i) => {
    init(w, { y: 40, autoAlpha: 0 });
    go(w, 27.0 + i * 0.06, 0.42, { y: 0, autoAlpha: 1 }, "back.out(1.5)");
  });
  const cta = endcard.querySelector(".cta");
  const site = endcard.querySelector(".site");
  init(cta, { autoAlpha: 0, scale: 0.85, xPercent: -50, x: 0 });
  init(site, { autoAlpha: 0, y: 12 });
  cta.style.transform = "";
  go(cta, 27.55, 0.4, { autoAlpha: 1, scale: 1 }, "back.out(1.7)");
  go(site, 27.75, 0.35, { autoAlpha: 1, y: 0 }, "power2.out");

  tl.set({}, {}, DUR);
  window.__sfx = SFX.sort((a, b) => a[1] - b[1]);
  tl.seek(0);
})();
