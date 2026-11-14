"use strict";
/* Baut aus einer QR-Matrix ein SVG. Es werden nur geprüfte Zahlen und Hex-Farben eingesetzt. */
(function (global) {
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const num = (v) => String(Math.round(v * 1000) / 1000);
  const col = (c, fallback) => (HEX.test(c) ? c : fallback);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a));

  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    const a = num(r);
    return (
      `M${num(x + r)} ${num(y)}h${num(w - 2 * r)}a${a} ${a} 0 0 1 ${a} ${a}v${num(h - 2 * r)}` +
      `a${a} ${a} 0 0 1 -${a} ${a}h-${num(w - 2 * r)}a${a} ${a} 0 0 1 -${a} -${a}v-${num(h - 2 * r)}` +
      `a${a} ${a} 0 0 1 ${a} -${a}z`
    );
  }

  const EYE_FRAME = { square: [0, 0], rounded: [2, 1.2], circle: [3.5, 2.5] };
  const EYE_BALL = { square: 0, rounded: 0.9, circle: 1.5 };

  /** Position der Logo-Zone (in Modulen, ohne Rand). */
  function logoGeometry(n, logo) {
    if (!logo || !/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(logo.dataUrl || "")) return null;
    if (!(logo.w > 0 && logo.h > 0)) return null;
    const scale = clamp(logo.scale, 0.1, 0.35);
    const L = Math.max(1, n * scale);
    let iw = L, ih = L;
    if (logo.shape === "orig") {
      const ratio = logo.w / logo.h;
      if (ratio >= 1) ih = L / ratio; else iw = L * ratio;
    }
    const pad = clamp(logo.padding, 0, 4);
    const maxSide = n - 18;
    let pw = Math.min(maxSide, Math.ceil(iw + 2 * pad));
    let ph = Math.min(maxSide, Math.ceil(ih + 2 * pad));
    if ((n - pw) % 2) pw = Math.min(pw + 1, n - 17) ;
    if ((n - ph) % 2) ph = Math.min(ph + 1, n - 17);
    iw = Math.min(iw, pw); ih = Math.min(ih, ph);
    return { x0: (n - pw) / 2, y0: (n - ph) / 2, pw, ph, iw, ih };
  }

  function toSVG(qr, o, px) {
    const n = qr.size;
    const margin = clamp(o.margin, 0, 10);
    const T = n + 2 * margin;
    const fg1 = col(o.fg1, "#000000");
    const fg2 = col(o.fg2, "#000000");
    const bg = col(o.bg, "#ffffff");
    const fill = o.gradient ? "url(#g)" : fg1;
    const frameFill = o.eyesCustom ? col(o.eyeFrame, fg1) : fill;
    const ballFill = o.eyesCustom ? col(o.eyeBall, fg1) : fill;
    const geo = logoGeometry(n, o.logo);

    let defs = "";
    let body = "";
    if (o.gradient) {
      const c = { h: [0, 0, T, 0], v: [0, 0, 0, T], d: [0, 0, T, T] }[o.gradAngle] || [0, 0, T, T];
      defs += `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${c[0]}" y1="${c[1]}" x2="${c[2]}" y2="${c[3]}"><stop offset="0" stop-color="${fg1}"/><stop offset="1" stop-color="${fg2}"/></linearGradient>`;
    }
    if (!o.bgTransparent) {
      const rx = (clamp(o.bgRadius, 0, 25) / 100) * T;
      body += `<rect width="${num(T)}" height="${num(T)}" rx="${num(rx)}" fill="${bg}"/>`;
    }

    // Datenmodule
    const inEye = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    const inHole = (x, y) => geo && x >= geo.x0 && x < geo.x0 + geo.pw && y >= geo.y0 && y < geo.y0 + geo.ph;
    const shape = ["square", "rounded", "dots", "small", "diamond"].includes(o.shape) ? o.shape : "square";
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!qr.modules[y][x] || inEye(x, y) || inHole(x, y)) continue;
        const X = margin + x, Y = margin + y;
        if (shape === "square") d += `M${X} ${Y}h1v1h-1z`;
        else if (shape === "rounded") d += rrect(X + 0.04, Y + 0.04, 0.92, 0.92, 0.32);
        else if (shape === "dots") d += rrect(X + 0.05, Y + 0.05, 0.9, 0.9, 0.45);
        else if (shape === "small") d += `M${num(X + 0.12)} ${num(Y + 0.12)}h.76v.76h-.76z`;
        else d += `M${num(X + 0.5)} ${num(Y - 0.04)}l.54 .54l-.54 .54l-.54 -.54z`;
      }
    }
    const crisp = shape === "square" ? ' shape-rendering="crispEdges"' : "";
    body += `<path d="${d}" fill="${fill}"${crisp}/>`;

    // Suchmuster (Augen)
    const fr = EYE_FRAME[o.eyeFrameShape] || EYE_FRAME.square;
    const br = EYE_BALL[o.eyeBallShape] !== undefined ? EYE_BALL[o.eyeBallShape] : 0;
    let frames = "", balls = "";
    for (const [ex, ey] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      const X = margin + ex, Y = margin + ey;
      frames += rrect(X, Y, 7, 7, fr[0]) + rrect(X + 1, Y + 1, 5, 5, fr[1]);
      balls += rrect(X + 2, Y + 2, 3, 3, br);
    }
    body += `<path d="${frames}" fill="${frameFill}" fill-rule="evenodd"/>`;
    body += `<path d="${balls}" fill="${ballFill}"/>`;

    // Logo
    if (geo) {
      const sh0 = o.logo.shape;
      o = Object.assign({}, o, { logo: Object.assign({}, o.logo, { shape: ["orig", "round", "rounded"].includes(sh0) ? sh0 : "orig" }) });
      const ix = margin + geo.x0 + (geo.pw - geo.iw) / 2;
      const iy = margin + geo.y0 + (geo.ph - geo.ih) / 2;
      const sh = o.logo.shape;
      let clip = "";
      let attr = "";
      if (sh === "round" || sh === "rounded") {
        const r = sh === "round" ? geo.iw / 2 : geo.iw * 0.22;
        defs += `<clipPath id="lc"><path d="${rrect(ix, iy, geo.iw, geo.ih, r)}"/></clipPath>`;
        attr = ' clip-path="url(#lc)"';
      }
      const par = sh === "orig" ? "xMidYMid meet" : "xMidYMid slice";
      body += `<image x="${num(ix)}" y="${num(iy)}" width="${num(geo.iw)}" height="${num(geo.ih)}" preserveAspectRatio="${par}" href="${o.logo.dataUrl}" xlink:href="${o.logo.dataUrl}"${attr}/>`;
    }

    const size = px ? ` width="${px}" height="${px}"` : "";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${size} viewBox="0 0 ${num(T)} ${num(T)}">` +
      (defs ? `<defs>${defs}</defs>` : "") + body + "</svg>"
    );
  }

  global.QRRender = { toSVG, logoGeometry, totalModules: (n, m) => n + 2 * clamp(m, 0, 10) };
})(window);
