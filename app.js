"use strict";
(function () {
  const form = document.getElementById("f");
  const preview = document.getElementById("preview");
  const empty = document.getElementById("empty");
  const msgs = document.getElementById("msgs");
  const info = document.getElementById("info");
  const dlPng = document.getElementById("dlPng");
  const dlSvg = document.getElementById("dlSvg");
  const pxSel = document.getElementById("px");
  const logoFile = document.getElementById("logoFile");
  const logoControls = document.getElementById("logoControls");
  const dropText = document.getElementById("dropText");
  const drop = document.getElementById("drop");

  let logo = null; // { dataUrl (png), w, h }
  let current = null; // { svg }
  let previewUrl = null;

  const el = (n) => form.elements[n];
  const val = (n) => el(n).value;
  const chk = (n) => el(n).checked;

  form.addEventListener("submit", (e) => e.preventDefault());

  // ---------- Inhalt ----------
  const wifiEsc = (s) => s.replace(/([\\;,:"])/g, "\\$1");
  const vEsc = (s) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const clean = (s) => s.replace(/[\r\n]+/g, " ").trim();

  function payload() {
    switch (val("type")) {
      case "text":
        return val("text").trim();
      case "wifi": {
        const ssid = clean(val("ssid"));
        if (!ssid) return "";
        const enc = val("wenc");
        const pw = enc === "nopass" ? "" : `P:${wifiEsc(val("wpass"))};`;
        return `WIFI:T:${enc};S:${wifiEsc(ssid)};${pw}H:${chk("whidden") ? "true" : "false"};;`;
      }
      case "mail": {
        const a = clean(val("maddr"));
        if (!a) return "";
        const q = [];
        if (val("msubj").trim()) q.push("subject=" + encodeURIComponent(clean(val("msubj"))));
        if (val("mbody").trim()) q.push("body=" + encodeURIComponent(val("mbody").trim()));
        return "mailto:" + encodeURIComponent(a).replace(/%40/g, "@") + (q.length ? "?" + q.join("&") : "");
      }
      case "tel": {
        const t = val("tel").replace(/[^\d+]/g, "");
        return t ? "tel:" + t : "";
      }
      case "vcard": {
        const f = clean(val("vfirst")), l = clean(val("vlast"));
        const org = clean(val("vorg")), tel = val("vtel").replace(/[^\d+]/g, "");
        const mail = clean(val("vmail")), url = clean(val("vurl"));
        if (!(f || l || org)) return "";
        const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${vEsc(l)};${vEsc(f)};;;`, `FN:${vEsc((f + " " + l).trim() || org)}`];
        if (org) lines.push("ORG:" + vEsc(org));
        if (tel) lines.push("TEL:" + tel);
        if (mail) lines.push("EMAIL:" + vEsc(mail));
        if (url) lines.push("URL:" + vEsc(url));
        lines.push("END:VCARD");
        return lines.join("\r\n");
      }
    }
    return "";
  }

  // ---------- Farben prüfen ----------
  function lum(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  function options() {
    return {
      margin: +val("margin"),
      shape: val("shape"),
      eyeFrameShape: val("eyeFrameShape"),
      eyeBallShape: val("eyeBallShape"),
      fg1: val("fg1"), fg2: val("fg2"),
      gradient: chk("gradient"), gradAngle: val("gradAngle"),
      eyesCustom: chk("eyesCustom"), eyeFrame: val("eyeFrame"), eyeBall: val("eyeBall"),
      bg: val("bg"), bgTransparent: chk("bgTransparent"), bgRadius: +val("bgRadius"),
      logo: logo ? { dataUrl: logo.dataUrl, w: logo.w, h: logo.h, shape: val("logoShape"), scale: +val("logoScale") / 100, padding: +val("logoPad") } : null,
    };
  }

  function msg(text, err) {
    const d = document.createElement("div");
    d.className = "msg" + (err ? " err" : "");
    d.textContent = text;
    msgs.appendChild(d);
  }

  // ---------- Rendern ----------
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }

  function render() {
    msgs.textContent = "";
    const out = document.querySelectorAll("[data-out]");
    out.forEach((o) => {
      const n = o.dataset.out;
      o.textContent = val(n) + (n === "bgRadius" || n === "logoScale" ? " %" : "");
    });
    document.querySelectorAll("[data-for]").forEach((f) => {
      const k = f.dataset.for;
      if (["gradient", "eyesCustom"].includes(k)) f.hidden = !chk(k);
      else f.hidden = f.dataset.for !== val("type");
    });
    logoControls.hidden = !logo;

    const text = payload();
    current = null;
    if (!text) {
      preview.hidden = true; empty.hidden = false; info.textContent = "";
      dlPng.disabled = dlSvg.disabled = true;
      return;
    }
    let level = val("ecc");
    if (logo && (level === "L" || level === "M")) { level = "Q"; msg("Mit Logo wird mindestens Fehlerkorrektur Q verwendet."); }
    let qr;
    try {
      qr = QR.encode(text, level, logo ? 5 : 1);
    } catch (e) {
      preview.hidden = true; empty.hidden = false; empty.textContent = "";
      dlPng.disabled = dlSvg.disabled = true; info.textContent = "";
      msg(e instanceof RangeError ? e.message : "QR-Code konnte nicht erzeugt werden.", true);
      return;
    }
    const o = options();
    const svg = QRRender.toSVG(qr, o, 0);
    current = { svg, o, qr };
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    preview.src = previewUrl;
    preview.hidden = false; empty.hidden = true;
    dlPng.disabled = dlSvg.disabled = false;

    // Hinweise
    let extra = "";
    const geo = QRRender.logoGeometry(qr.size, o.logo);
    if (geo) {
      const frac = (geo.pw * geo.ph) / (qr.size * qr.size);
      extra = ` · Logo verdeckt ${Math.round(frac * 100)} % der Fläche`;
      if (frac > 0.16) msg("Das Logo ist sehr groß. Verkleinere es oder verringere den Freiraum, sonst wird der Code evtl. nicht gelesen.", true);
    }
    info.textContent = `Version ${qr.version} · ${qr.size}×${qr.size} Module · Fehlerkorrektur ${qr.level}${extra}`;
    if (!o.bgTransparent) {
      const fgs = o.gradient ? [o.fg1, o.fg2] : [o.fg1];
      const worst = Math.min(...fgs.map((c) => contrast(c, o.bg)));
      if (fgs.some((c) => lum(c) > lum(o.bg))) msg("Heller Code auf dunklem Grund: Manche Scanner lesen invertierte Codes nicht.");
      else if (worst < 3) msg("Der Kontrast zwischen Code und Hintergrund ist niedrig. Wähle dunklere Code- oder hellere Hintergrundfarben.", true);
    } else msg("Transparenter Hintergrund: Die Lesbarkeit hängt vom Untergrund ab, auf dem der Code später liegt.");
    if (o.margin < 4) msg("Eine Ruhezone unter 4 Modulen kann das Scannen erschweren.");
    if (o.eyesCustom && !o.bgTransparent && contrast(o.eyeFrame, o.bg) < 3) msg("Die Eck-Muster haben wenig Kontrast zum Hintergrund.", true);
  }

  // ---------- Export ----------
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function exportPx() {
    const T = QRRender.totalModules(current.qr.size, current.o.margin);
    const req = +pxSel.value;
    return Math.ceil(req / T) * T; // ganzzahlige Pixel pro Modul, keine Nähte
  }
  dlSvg.addEventListener("click", () => {
    if (!current) return;
    const svg = QRRender.toSVG(current.qr, current.o, exportPx());
    download(new Blob([svg], { type: "image/svg+xml" }), "qr-code.svg");
  });
  dlPng.addEventListener("click", async () => {
    if (!current) return;
    dlPng.disabled = true;
    try {
      const px = exportPx();
      const svg = QRRender.toSVG(current.qr, current.o, px);
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const c = document.createElement("canvas");
      c.width = c.height = px;
      c.getContext("2d").drawImage(img, 0, 0, px, px);
      URL.revokeObjectURL(url);
      const blob = await new Promise((res) => c.toBlob(res, "image/png"));
      if (!blob) throw new Error("png");
      download(blob, "qr-code.png");
    } catch (e) {
      msgs.textContent = "";
      msg("PNG-Export fehlgeschlagen. Versuche eine kleinere Größe oder nutze SVG.", true);
    } finally { dlPng.disabled = false; }
  });

  // ---------- Logo ----------
  const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
  async function loadLogo(file) {
    msgs.textContent = "";
    if (!file) return;
    if (!OK_TYPES.includes(file.type)) { render(); msg("Dateityp nicht erlaubt. Nutze PNG, JPG, WebP, GIF oder SVG.", true); return; }
    if (file.size > 5 * 1024 * 1024) { render(); msg("Die Datei ist größer als 5 MB.", true); return; }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      let w = img.naturalWidth || 512, h = img.naturalHeight || 512;
      const k = Math.min(1, 768 / Math.max(w, h));
      w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h); // Neuzeichnen entfernt Metadaten und aktive Inhalte (SVG)
      logo = { dataUrl: c.toDataURL("image/png"), w, h };
      dropText.firstChild.textContent = file.name.slice(0, 60);
    } catch (e) {
      logo = null;
      render(); msg("Das Bild konnte nicht gelesen werden.", true); return;
    } finally { URL.revokeObjectURL(url); }
    render();
  }
  logoFile.addEventListener("change", () => loadLogo(logoFile.files[0]));
  document.getElementById("logoRemove").addEventListener("click", () => {
    logo = null; logoFile.value = ""; dropText.firstChild.textContent = "Logo auswählen oder hierher ziehen"; render();
  });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, () => drop.classList.add("over")));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files[0]) { e.preventDefault(); loadLogo(e.dataTransfer.files[0]); }
  });
  ["dragover", "drop"].forEach((t) => window.addEventListener(t, (e) => e.preventDefault()));

  // ---------- Vorlagen ----------
  const PRESETS = {
    classic: { shape: "square", eyeFrameShape: "square", eyeBallShape: "square", fg1: "#111827", bg: "#ffffff", gradient: false, eyesCustom: false, bgRadius: 0 },
    ocean: { shape: "dots", eyeFrameShape: "rounded", eyeBallShape: "circle", fg1: "#0ea5e9", fg2: "#1e3a8a", gradient: true, gradAngle: "d", eyesCustom: true, eyeFrame: "#1e3a8a", eyeBall: "#0ea5e9", bg: "#ffffff", bgRadius: 8 },
    sunset: { shape: "rounded", eyeFrameShape: "rounded", eyeBallShape: "rounded", fg1: "#e11d48", fg2: "#f59e0b", gradient: true, gradAngle: "v", eyesCustom: false, bg: "#fff7ed", bgRadius: 10 },
    forest: { shape: "diamond", eyeFrameShape: "square", eyeBallShape: "circle", fg1: "#14532d", fg2: "#65a30d", gradient: true, gradAngle: "h", eyesCustom: true, eyeFrame: "#14532d", eyeBall: "#65a30d", bg: "#f7fee7", bgRadius: 0 },
    soft: { shape: "small", eyeFrameShape: "circle", eyeBallShape: "circle", fg1: "#6d28d9", gradient: false, eyesCustom: false, bg: "#faf5ff", bgRadius: 20 },
  };
  document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const p = PRESETS[b.dataset.preset];
    if (!p) return;
    Object.keys(p).forEach((k) => {
      const f = el(k);
      if (!f) return;
      if (typeof p[k] === "boolean") f.checked = p[k]; else f.value = p[k];
    });
    el("bgTransparent").checked = false;
    render();
  }));

  form.addEventListener("input", schedule);
  form.addEventListener("change", schedule);
  render();
})();
