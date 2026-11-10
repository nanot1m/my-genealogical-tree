import { t, lang } from './i18n.js';
import { $, esc } from './util.js';
import { cardsEl, edgesSvg, badgesEl } from './render.js';

let ctx = null;
export function initPdf(c) {
  ctx = c;
  $('#pdfdlg').addEventListener('change', () => {
    $('#pd-hint').textContent = pdfHint();
  });
  $('#pd-cancel').addEventListener('click', () => $('#pdfdlg').classList.remove('show'));
  $('#pdfdlg').addEventListener('pointerdown', (e) => {
    if (e.target === $('#pdfdlg')) $('#pdfdlg').classList.remove('show');
  });
  $('#pd-go').addEventListener('click', () => {
    const o = pdfOpts();
    localStorage.setItem(PDF_KEY, JSON.stringify(o));
    $('#pdfdlg').classList.remove('show');
    printPdf(o);
  });
}

export const PAPERS = { a4: [210, 297], a3: [297, 420], letter: [215.9, 279.4] };

export const PDF_KEY = 'familytree.pdf';

export const pdfOpts = () => ({
  paper: $('#pd-paper').value,
  mode: $('#pd-mode').value,
  scale: +$('#pd-scale').value,
  orient: $('#pd-orient').value,
  gray: $('#pd-gray').checked,
  plain: $('#pd-plain').checked,
});

export function pdfPlan(o) {
  const PX = 96 / 25.4,
    margin = (o.mode === 'fit' ? 10 : 14) * PX,
    overlap = 10 * PX,
    footer = 9 * PX,
    pad = 24;
  const b = ctx.bbox(),
    [sw, sh] = PAPERS[o.paper];
  const orient = (pw, ph) => {
    const aw = pw - 2 * margin,
      ah = ph - 2 * margin - footer;
    if (o.mode === 'fit')
      return {
        pw,
        ph,
        aw,
        ah,
        margin,
        footer,
        s: Math.min(aw / (b.w + 2 * pad), ah / (b.h + 2 * pad)),
        cols: 1,
        rows: 1,
        tw: aw,
        th: ah,
      };
    const s = o.scale,
      tw = aw - overlap,
      th = ah - overlap;
    return {
      pw,
      ph,
      aw,
      ah,
      margin,
      footer,
      overlap,
      s,
      tw,
      th,
      cols: Math.max(1, Math.ceil(((b.w + 2 * pad) * s) / tw)),
      rows: Math.max(1, Math.ceil(((b.h + 2 * pad) * s) / th)),
    };
  };
  const cards = [...ctx.positions.values()];
  const withTiles = (plan) => {
    plan.landscape = plan.pw > plan.ph;
    plan.tiles = [];
    const fit = o.mode === 'fit';
    const totalW = fit ? plan.aw / plan.s : 0,
      totalH = fit ? plan.ah / plan.s : 0;
    const ox = fit ? b.x + b.w / 2 - totalW / 2 : b.x - pad,
      oy = fit ? b.y + b.h / 2 - totalH / 2 : b.y - pad;
    for (let r = 0; r < plan.rows; r++)
      for (let c = 0; c < plan.cols; c++) {
        const x0 = ox + (c * plan.tw) / plan.s,
          y0 = oy + (r * plan.th) / plan.s;
        const w = (c < plan.cols - 1 ? plan.tw : plan.aw) / plan.s,
          h = (r < plan.rows - 1 ? plan.th : plan.ah) / plan.s;
        const used =
          fit || cards.some((p) => p.x < x0 + w && p.x + ctx.CARD_W > x0 && p.y < y0 + h && p.y + ctx.CARD_H > y0);
        if (used) plan.tiles.push({ r, c, x0, y0 });
      }
    return plan;
  };
  const L = withTiles(orient(sh * PX, sw * PX)),
    P = withTiles(orient(sw * PX, sh * PX));
  const plan =
    o.orient === 'landscape'
      ? L
      : o.orient === 'portrait'
        ? P
        : o.mode === 'fit'
          ? L.s >= P.s
            ? L
            : P
          : L.tiles.length <= P.tiles.length
            ? L
            : P;
  plan.paperMM = plan.pw > plan.ph ? [sh, sw] : [sw, sh];
  if (o.mode === 'poster' && plan.tiles.length === 1) {
    const f = pdfPlan({ ...o, mode: 'fit' });
    if (f.s > plan.s) return f;
  }
  return plan;
}

export function pdfHint() {
  if (!ctx.positions.size) return '';
  const plan = pdfPlan(pdfOpts());
  $('#pd-scale-row').hidden = pdfOpts().mode === 'fit';
  drawPdfPreview(plan);
  return (
    t('pd_pages')
      .replace('{n}', plan.tiles.length)
      .replace('{s}', Math.round(plan.s * 100)) +
    ' · ' +
    t('pd_print_hint')
      .replace('{p}', $('#pd-paper').selectedOptions[0].textContent)
      .replace('{o}', t(plan.landscape ? 'pd_landscape' : 'pd_portrait').toLowerCase())
  );
}

export function drawPdfPreview(plan) {
  const svg = $('#pd-preview'),
    W = 340,
    H = 120,
    pad = 6;
  const sheets = plan.tiles.map((tl) => ({ ...tl, w: plan.aw / plan.s, h: plan.ah / plan.s }));
  const xs = sheets.map((t) => t.x0),
    ys = sheets.map((t) => t.y0);
  const minX = Math.min(...xs),
    minY = Math.min(...ys),
    maxX = Math.max(...sheets.map((t) => t.x0 + t.w)),
    maxY = Math.max(...sheets.map((t) => t.y0 + t.h));
  const k = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
  const ox = pad + (W - 2 * pad - (maxX - minX) * k) / 2,
    oy = pad + (H - 2 * pad - (maxY - minY) * k) / 2;
  const X = (v) => ox + (v - minX) * k,
    Y = (v) => oy + (v - minY) * k;
  const cards = [...ctx.positions.values()]
    .map(
      (p) =>
        `<rect x="${X(p.x)}" y="${Y(p.y)}" width="${Math.max(1, ctx.CARD_W * k)}" height="${Math.max(1, ctx.CARD_H * k)}" rx="1" fill="var(--accent)" opacity=".55"/>`,
    )
    .join('');
  const fs = Math.max(5, Math.min(11, (plan.aw / plan.s) * k * 0.28));
  const tiles = sheets
    .map(
      (t) =>
        `<rect x="${X(t.x0)}" y="${Y(t.y0)}" width="${t.w * k}" height="${t.h * k}" fill="var(--card)" stroke="var(--border-strong)" stroke-width=".8"/>` +
        (plan.tiles.length > 1
          ? `<text x="${X(t.x0) + 3}" y="${Y(t.y0) + fs + 1}" font-size="${fs}" font-weight="600" fill="var(--muted)">${String.fromCharCode(65 + t.r)}${t.c + 1}</text>`
          : ''),
    )
    .join('');
  svg.innerHTML = tiles + cards;
}

export function exportPdf() {
  ctx.stopEditing();
  if (!ctx.positions.size) return ctx.toast(t('nothing_export'));
  try {
    const saved = JSON.parse(localStorage.getItem(PDF_KEY) || '{}');
    if (saved.paper) $('#pd-paper').value = saved.paper;
    if (saved.mode) $('#pd-mode').value = saved.mode;
    if (saved.scale) $('#pd-scale').value = String(saved.scale);
    $('#pd-gray').checked = !!saved.gray;
    $('#pd-plain').checked = !!saved.plain;
    if (saved.orient) $('#pd-orient').value = saved.orient;
  } catch (_) {}
  $('#pd-hint').textContent = pdfHint();
  $('#pdfdlg').classList.add('show');
}

export function printPdf(o) {
  const plan = pdfPlan(o);
  const css = [...document.styleSheets]
    .filter((ss) => !ss.href || new URL(ss.href).origin === location.origin)
    .flatMap((ss) => [...ss.cssRules].map((r) => r.cssText))
    .join('\n');
  const cardsCopy = cardsEl.cloneNode(true);
  cardsCopy
    .querySelectorAll('.card')
    .forEach((c) => c.classList.remove('selected', 'multi', 'common', 'onpath', 'editing', 'link-source', 'enter'));
  const world = `${edgesSvg.outerHTML}${badgesEl.outerHTML}<div id="cards">${cardsCopy.innerHTML}</div>`;
  const multi = plan.tiles.length > 1;
  const id = (r, c) => `${String.fromCharCode(65 + r)}${c + 1}`;
  const has = (r, c) => plan.tiles.some((t) => t.r === r && t.c === c);
  const label = (tl) => (multi ? id(tl.r, tl.c) : '');
  const guides = (tl) =>
    !multi
      ? ''
      : [
          has(tl.r, tl.c - 1) ? `<div class="guide l">← ${id(tl.r, tl.c - 1)}</div>` : '',
          has(tl.r, tl.c + 1) ? `<div class="guide r">${id(tl.r, tl.c + 1)} →</div>` : '',
          has(tl.r - 1, tl.c) ? `<div class="guide t">↑ ${id(tl.r - 1, tl.c)}</div>` : '',
          has(tl.r + 1, tl.c) ? `<div class="guide b">↓ ${id(tl.r + 1, tl.c)}</div>` : '',
          `<div class="sheet-id">${label(tl)}</div>`,
        ].join('');
  const glue = (tl) =>
    !multi
      ? ''
      : (has(tl.r, tl.c + 1) ? '<i class="glue r"></i>' : '') + (has(tl.r + 1, tl.c) ? '<i class="glue b"></i>' : '');
  const date = new Date().toLocaleDateString(lang);
  const pages = plan.tiles
    .map(
      (
        tl,
      ) => `<section class="page"><div class="clip"><div id="world" style="transform: translate(${-tl.x0 * plan.s}px, ${-tl.y0 * plan.s}px) scale(${plan.s})">${world}</div>${glue(tl)}</div>
    ${guides(tl)}
    <div class="foot"><span>${esc(ctx.shownName(ctx.fileName))}</span><span>${date} · ${Math.round(plan.s * 100)}%${multi ? ` · ${label(tl)} (${plan.rows}×${plan.cols})` : ''}</span></div>
    <i class="mark tl"></i><i class="mark tr"></i><i class="mark bl"></i><i class="mark br"></i></section>`,
    )
    .join('');
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(ctx.shownName(ctx.fileName))}</title><style>${css}
    @page { size: ${plan.paperMM[0]}mm ${plan.paperMM[1]}mm; margin: 0; }
    :root { color-scheme: light; --card-w: ${ctx.CARD_W}px; --card-h: ${ctx.CARD_H}px; --shadow-sm: none; --shadow: none; --shadow-lg: none; }
    .card, .card.selected, .card.multi, .marriage, .relbadge, .ord { box-shadow: none; }
    ${
      o.plain
        ? `:root { --bg: #fff; --card: #fff; --panel: #fff; --panel-2: #f1f3f8; --border: #9aa0ad; --border-strong: #6b7280; --text: #000; --muted: #4b5563; --line: #5b6373; --shadow-sm: none; --shadow: none; }
    .card, .card.selected, .card.multi { box-shadow: none; border-color: var(--border); }
    .card.index { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #000; }
    .photo { background: #e5e7eb !important; color: #374151 !important; border-color: #fff; box-shadow: 0 0 0 1px #9aa0ad; }
    .marriage, .relbadge, .ord { box-shadow: none; border-color: var(--border); }
    #edges path { stroke-width: 2.2; }
    #edges path.past { opacity: .6; }`
        : `.card.selected, .card.multi { border-color: var(--border); }`
    }
    html, body { overflow: visible; background: #fff; width: ${plan.paperMM[0]}mm; height: auto; margin: 0; }
    .page { position: relative; width: ${plan.paperMM[0]}mm; height: ${plan.paperMM[1]}mm; overflow: hidden; break-inside: avoid; page-break-inside: avoid; background: #fff; }
    .page + .page { break-before: page; page-break-before: always; }
    .clip { position: absolute; left: ${plan.margin}px; top: ${plan.margin}px; width: ${plan.aw}px; height: ${plan.ah}px; overflow: hidden; contain: strict; }
    #world { will-change: auto; }
    .foot { position: absolute; left: ${plan.margin}px; right: ${plan.margin}px; bottom: ${plan.margin * 0.4}px; display: flex; justify-content: space-between; font-size: 10px; color: #4b5563; }
    .guide { position: absolute; font-size: 11px; font-weight: 600; color: #6b7280; letter-spacing: .02em; }
    .guide.l { left: ${plan.margin * 0.25}px; top: 50%; transform: translateY(-50%) rotate(-90deg); transform-origin: center; white-space: nowrap; }
    .guide.r { right: ${plan.margin * 0.25}px; top: 50%; transform: translateY(-50%) rotate(90deg); transform-origin: center; white-space: nowrap; }
    .guide.t { left: 50%; top: ${plan.margin * 0.3}px; transform: translateX(-50%); }
    .guide.b { left: 50%; bottom: ${plan.margin * 0.3 + plan.footer}px; transform: translateX(-50%); }
    .sheet-id { position: absolute; left: ${plan.margin}px; top: ${plan.margin * 0.2}px; font-size: 14px; font-weight: 700; color: #374151; }
    .glue { position: absolute; border: 0 dashed #b9bfcc; pointer-events: none; }
    .glue.r { top: 0; bottom: 0; right: ${plan.overlap || 0}px; border-left-width: 1px; }
    .glue.b { left: 0; right: 0; bottom: ${plan.overlap || 0}px; border-top-width: 1px; }
    .mark { position: absolute; width: 14px; height: 14px; border: 0 solid #999; }
    .mark.tl { left: ${plan.margin - 15}px; top: ${plan.margin - 15}px; border-right-width: 1px; border-bottom-width: 1px; }
    .mark.tr { right: ${plan.margin - 15}px; top: ${plan.margin - 15}px; border-left-width: 1px; border-bottom-width: 1px; }
    .mark.bl { left: ${plan.margin - 15}px; bottom: ${plan.margin + plan.footer - 15}px; border-right-width: 1px; border-top-width: 1px; }
    .mark.br { right: ${plan.margin - 15}px; bottom: ${plan.margin + plan.footer - 15}px; border-left-width: 1px; border-top-width: 1px; }
    .plus, .photo .cam, .photo-x, .edit { display: none !important; }
    .card.leave { display: none; }
    .card { cursor: default; }
    .photo img { filter: ${o.gray ? 'grayscale(1)' : 'none'}; }
    .marriage.empty { display: none; }
  </style></head><body class="${ctx.compact ? 'compact' : ''} ${ctx.orderBadges ? '' : 'no-ord'}">${pages}
  <script>window.onload = () => setTimeout(() => { window.print(); }, 200);<\/script></body></html>`;
  const win = window.open('', '_blank');
  if (!win) return ctx.toast(t('save_failed'));
  win.document.open();
  win.document.write(html);
  win.document.close();
}
