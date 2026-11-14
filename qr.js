"use strict";
/*
 * Eigener QR-Code-Encoder (ISO/IEC 18004), Byte-Modus, Versionen 1-40,
 * Fehlerkorrektur L/M/Q/H. Keine externen Abhängigkeiten.
 */
(function (global) {
  const ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];
  const LEVELS = { L: { ord: 0, bits: 1 }, M: { ord: 1, bits: 0 }, Q: { ord: 2, bits: 3 }, H: { ord: 3, bits: 2 } };

  function numRawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }

  function numDataCodewords(ver, ord) {
    return Math.floor(numRawModules(ver) / 8) - ECC_PER_BLOCK[ord][ver] * NUM_BLOCKS[ord][ver];
  }

  // --- Reed-Solomon über GF(256), Polynom 0x11D ---
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsDivisor(degree) {
    const res = new Array(degree).fill(0);
    res[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 2);
    }
    return res;
  }

  function rsRemainder(data, divisor) {
    const res = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ res.shift();
      res.push(0);
      divisor.forEach((coef, i) => { res[i] ^= gfMul(coef, factor); });
    }
    return res;
  }

  function addEccAndInterleave(data, ver, ord) {
    const numBlocks = NUM_BLOCKS[ord][ver];
    const blockEcc = ECC_PER_BLOCK[ord][ver];
    const raw = Math.floor(numRawModules(ver) / 8);
    const numShort = numBlocks - (raw % numBlocks);
    const shortLen = Math.floor(raw / numBlocks);
    const div = rsDivisor(blockEcc);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - blockEcc + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((blk, j) => {
        if (i !== shortLen - blockEcc || j >= numShort) out.push(blk[i]);
      });
    }
    return out;
  }

  function alignPositions(ver) {
    if (ver === 1) return [];
    const na = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
    const res = [6];
    for (let pos = ver * 4 + 10; res.length < na; pos -= step) res.splice(1, 0, pos);
    return res;
  }

  function penalty(mod, size) {
    let result = 0;
    for (let dir = 0; dir < 2; dir++) {
      for (let a = 0; a < size; a++) {
        let runColor = -1, runLen = 0, line = "";
        for (let b = 0; b < size; b++) {
          const c = dir ? mod[b][a] : mod[a][b];
          line += c;
          if (c === runColor) {
            runLen++;
            if (runLen === 5) result += 3; else if (runLen > 5) result++;
          } else { runColor = c; runLen = 1; }
        }
        const padded = "0000" + line + "0000";
        for (const p of ["10111010000", "00001011101"]) {
          for (let i = padded.indexOf(p); i !== -1; i = padded.indexOf(p, i + 1)) result += 40;
        }
      }
    }
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        dark += mod[y][x];
        if (x < size - 1 && y < size - 1) {
          const c = mod[y][x];
          if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) result += 3;
        }
      }
    }
    const total = size * size;
    result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return result;
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  function build(ver, eccBits, codewords) {
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Uint8Array(size));
    const fn = Array.from({ length: size }, () => new Uint8Array(size));
    const setFn = (x, y, d) => { mod[y][x] = d ? 1 : 0; fn[y][x] = 1; };

    // Timing
    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    // Finder + Separatoren
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
        }
      }
    }
    // Alignment
    const ap = alignPositions(ver);
    for (let i = 0; i < ap.length; i++) {
      for (let j = 0; j < ap.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) setFn(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    const bit = (v, i) => ((v >>> i) & 1) !== 0;
    const drawFormat = (mask) => {
      const data = (eccBits << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(bits, i));
      setFn(8, 7, bit(bits, 6)); setFn(8, 8, bit(bits, 7)); setFn(7, 8, bit(bits, 8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(bits, i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(bits, i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(bits, i));
      setFn(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        setFn(a, b, bit(bits, i)); setFn(b, a, bit(bits, i));
      }
    }
    // Daten im Zickzack
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (!fn[y][x] && i < codewords.length * 8) {
            mod[y][x] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
            i++;
          }
        }
      }
    }
    const applyMask = (m) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] ^= 1;
    };
    let best = 0, bestPen = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const p = penalty(mod, size);
      if (p < bestPen) { bestPen = p; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return { size, mask: best, modules: mod };
  }

  /**
   * @param {string} text  beliebiger Text (UTF-8)
   * @param {"L"|"M"|"Q"|"H"} level
   * @param {number} minVersion  kleinste erlaubte Version (1-40)
   */
  function encode(text, level, minVersion) {
    const lv = LEVELS[level];
    if (!lv) throw new RangeError("Ungültige Fehlerkorrektur");
    const bytes = new TextEncoder().encode(text);
    let ver = Math.max(1, Math.min(40, minVersion | 0 || 1));
    for (; ; ver++) {
      const ccBits = ver < 10 ? 8 : 16;
      const cap = numDataCodewords(ver, lv.ord) * 8;
      if (4 + ccBits + bytes.length * 8 <= cap && bytes.length < (1 << ccBits)) break;
      if (ver >= 40) throw new RangeError("Der Inhalt ist für einen QR-Code zu lang.");
    }
    const ccBits = ver < 10 ? 8 : 16;
    const cap = numDataCodewords(ver, lv.ord) * 8;
    const bits = [];
    const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    push(4, 4);
    push(bytes.length, ccBits);
    bytes.forEach((b) => push(b, 8));
    push(0, Math.min(4, cap - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    const all = addEccAndInterleave(data, ver, lv.ord);
    const m = build(ver, lv.bits, all);
    return { version: ver, size: m.size, mask: m.mask, modules: m.modules, level };
  }

  global.QR = { encode, _numDataCodewords: numDataCodewords, _penalty: penalty, _build: build };
})(typeof window !== "undefined" ? window : globalThis);
