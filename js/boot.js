/* Torah Fighter — boot loader. Loads Three.js as an ES module together with GLTFLoader and SkeletonUtils (needed for the
   skinned KayKit heroes), publishes them as the global THREE the classic scripts expect, then runs the game scripts in
   order. If modules cannot be loaded it falls back to the plain UMD build (procedural heroes, or the 2D renderer). */
(async () => {
  const base = document.currentScript ? document.currentScript.src.replace(/[^/]*$/, '') : 'js/';
  const load = (src) => new Promise((res) => { const s = document.createElement('script'); s.src = base + src; s.async = false; s.onload = res; s.onerror = res; document.body.appendChild(s); });
  try {
    const [NS, G, S] = await Promise.all([import(base + 'vendor/three.module.min.js'), import(base + 'vendor/GLTFLoader.js'), import(base + 'vendor/SkeletonUtils.js')]);
    window.THREE = Object.assign({}, NS, { GLTFLoader: G.GLTFLoader, SkeletonUtils: S });
  } catch (e) {
    console.warn('Three.js modules unavailable, using the fallback build', e);
    await load('vendor/three.min.js');
  }
  for (const s of ['data.js', 'audio.js', 'input.js', 'engine.js', 'ai.js', 'art.js', 'chars3d.js', 'render3d.js', 'vfx3d.js', 'ui.js']) await load(s);
})();
