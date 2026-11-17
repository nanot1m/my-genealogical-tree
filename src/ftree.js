// .ftree container: "FTREE" + version byte, u32 LE metadata length, JSON metadata, then length-prefixed photo blobs.
import { dataUrlToBytes, bytesToDataUrl } from './util.js';

export const MAGIC = [0x46, 0x54, 0x52, 0x45, 0x45, 0x01];

export function encodeTree(state) {
  const blobs = [];
  const ref = (url) => {
    if (!url) return null;
    const { mime, bytes } = dataUrlToBytes(url);
    blobs.push({ mime, bytes });
    return blobs.length - 1;
  };
  const people = {};
  for (const p of Object.values(state.people)) {
    const { photo, photoSrc, ...rest } = p;
    people[p.id] = { ...rest, thumbRef: ref(photo), photoRef: ref(photoSrc) };
  }
  const meta = new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      people,
      families: state.families,
      relations: state.relations,
      indexPerson: state.indexPerson || null,
      households: state.households || [],
      collapsed: state.collapsed || [],
      cutAbove: state.cutAbove || [],
      focus: state.focus || null,
      focusMode: state.focusMode || 'down',
      focusDegree: state.focusDegree || 0,
      hiddenPeople: state.hiddenPeople || [],
      blobs: blobs.map((b) => b.mime),
    }),
  );
  const head = new Uint8Array(MAGIC.length + 4);
  head.set(MAGIC);
  new DataView(head.buffer).setUint32(MAGIC.length, meta.length, true);
  const parts = [head, meta];
  for (const b of blobs) {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, b.bytes.length, true);
    parts.push(len, b.bytes);
  }
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function decodeTree(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (!MAGIC.slice(0, 5).every((b, i) => u8[i] === b)) {
    const text = new TextDecoder().decode(u8).trim();
    if (!text.startsWith('{')) throw new Error('not_tree');
    return JSON.parse(text);
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let off = MAGIC.length;
  const metaLen = dv.getUint32(off, true);
  off += 4;
  const meta = JSON.parse(new TextDecoder().decode(u8.subarray(off, off + metaLen)));
  off += metaLen;
  const blobs = [];
  for (const mime of meta.blobs || []) {
    const len = dv.getUint32(off, true);
    off += 4;
    blobs.push(bytesToDataUrl(u8.subarray(off, off + len), mime));
    off += len;
  }
  const people = {};
  for (const p of Object.values(meta.people || {})) {
    const { thumbRef, photoRef, ...rest } = p;
    people[p.id] = {
      ...rest,
      photo: thumbRef == null ? null : blobs[thumbRef],
      photoSrc: photoRef == null ? null : blobs[photoRef],
    };
  }
  return {
    version: 1,
    people,
    families: meta.families || {},
    relations: meta.relations || [],
    indexPerson: meta.indexPerson || null,
    households: meta.households || [],
    collapsed: meta.collapsed || [],
    cutAbove: meta.cutAbove || [],
    focus: meta.focus || null,
    focusMode: meta.focusMode || 'down',
    focusDegree: meta.focusDegree || 0,
    hiddenPeople: meta.hiddenPeople || [],
  };
}
