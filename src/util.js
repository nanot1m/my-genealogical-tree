export function uid(p) {
  return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

export const dateParts = (s) => {
  const m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec((s || '').trim());
  return m ? [+m[1], m[2] ? +m[2] : null, m[3] ? +m[3] : null] : null;
};

export const isExactDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export function rounded(pts, r = 10) {
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1],
      p1 = pts[i],
      p2 = pts[i + 1];
    const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y),
      d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    if (rr < 1) {
      d += ` L${p1.x} ${p1.y}`;
      continue;
    }
    const a = { x: p1.x + ((p0.x - p1.x) / d1) * rr, y: p1.y + ((p0.y - p1.y) / d1) * rr };
    const b = { x: p1.x + ((p2.x - p1.x) / d2) * rr, y: p1.y + ((p2.y - p1.y) / d2) * rr };
    d += ` L${a.x} ${a.y} Q${p1.x} ${p1.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last.x} ${last.y}`;
}

export function year(s) {
  return s ? s.slice(0, 4) : '';
}

export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length
    ? parts
        .slice(0, 2)
        .map((s) => s[0].toUpperCase())
        .join('')
    : '';
}

export function hueOf(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function dataUrlToBytes(url) {
  const i = url.indexOf(',');
  const mime = url.slice(5, url.indexOf(';'));
  const bin = atob(url.slice(i + 1));
  const out = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
  return { mime, bytes: out };
}

export function bytesToDataUrl(bytes, mime) {
  let bin = '';
  for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
  return `data:${mime};base64,` + btoa(bin);
}

export function ageOf(birth, ref) {
  const b = dateParts(birth);
  if (!b) return null;
  const now = new Date(),
    r = ref ? dateParts(ref) : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  if (!r) return null;
  let a = r[0] - b[0];
  if (b[1] && r[1] && (r[1] < b[1] || (r[1] === b[1] && b[2] && r[2] && r[2] < b[2]))) a--;
  return a >= 0 ? a : null;
}

export const $ = (s) => document.querySelector(s);
export const sh = (id) => document.getElementById(id);
