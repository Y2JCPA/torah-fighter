/* Reference-preserving snapshots for the render-only online guest. No eval. */
'use strict';
const NetCodec = (() => {
  function encode(root) {
    const nodes = [], seen = new Map();
    function pack(v) {
      if (typeof v === 'function' || v === undefined) return null;
      if (typeof v === 'number' && !Number.isFinite(v)) return { n: String(v) };
      if (!v || typeof v !== 'object') return v;
      if (seen.has(v)) return { r: seen.get(v) };
      const id = nodes.length; seen.set(v, id); nodes.push(null);
      const type = v instanceof ENG.Fighter ? 'fighter' : v instanceof Set ? 'set' : Array.isArray(v) ? 'array' : 'object';
      nodes[id] = { type, data: type === 'set' || type === 'array' ? Array.from(v, pack) : Object.fromEntries(Object.entries(v).filter(([,x]) => typeof x !== 'function').map(([k,x]) => [k,pack(x)])) };
      return { r: id };
    }
    return JSON.stringify({ root: pack(root), nodes });
  }
  function decode(text) {
    const graph = JSON.parse(text);
    if (!Array.isArray(graph.nodes) || graph.nodes.length > 30000) throw Error('Invalid snapshot');
    const objects = graph.nodes.map(n => n.type === 'fighter' ? Object.create(ENG.Fighter.prototype) : n.type === 'array' ? [] : n.type === 'set' ? new Set() : {});
    const unpack = v => v && typeof v === 'object' ? 'r' in v ? objects[v.r] : v.n === 'Infinity' ? Infinity : v.n === '-Infinity' ? -Infinity : 0 : v;
    graph.nodes.forEach((n,i) => {
      if(n.type === 'set') n.data.forEach(v=>objects[i].add(unpack(v)));
      else Object.entries(n.data).forEach(([k,v]) => {if (!['__proto__','constructor','prototype'].includes(k)) objects[i][k]=unpack(v);});
    });
    return unpack(graph.root);
  }
  return {encode, decode};
})();
