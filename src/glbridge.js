// The WebGL layer is optional and loaded on demand: Safari on iPhone runs out of memory with it, so the DOM renderer
// is the default and Pixi is only fetched when the user opts in.
export const GL_KEY = 'familytree.gl';
export const gl = { active: false, sync() {}, setPositions() {}, setView() {} };

export async function enableGL(ctx, els) {
  if (localStorage.getItem(GL_KEY) !== '1') return false;
  const m = await import('./gl.js');
  const ok = await m.initGL(ctx, els);
  if (!ok) return false;
  gl.active = true;
  gl.sync = m.glSync;
  gl.setPositions = m.glSetPositions;
  gl.setView = m.glSetView;
  return true;
}
