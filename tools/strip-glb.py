"""Strip animations from a KayKit GLB (keeping a whitelist) and compact the binary chunk."""
import sys, json, struct
src, dst, keep = sys.argv[1], sys.argv[2], set(sys.argv[3].split(',')) if len(sys.argv) > 3 and sys.argv[3] else set()
d = open(src, 'rb').read()
clen, _ = struct.unpack('<II', d[12:20])
j = json.loads(d[20:20 + clen])
blen, _ = struct.unpack('<II', d[20 + clen:28 + clen])
binb = d[28 + clen:28 + clen + blen]
j['animations'] = [a for a in j.get('animations', []) if a['name'] in keep]
missing = keep - set(a['name'] for a in j['animations'])
if missing: print('MISSING', missing)
if not j['animations']: del j['animations']
used = set()
for m in j['meshes']:
    for p in m['primitives']:
        used.update(p['attributes'].values())
        if 'indices' in p: used.add(p['indices'])
        for t in p.get('targets', []): used.update(t.values())
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: used.add(s['inverseBindMatrices'])
for a in j.get('animations', []):
    for s in a['samplers']: used.add(s['input']); used.add(s['output'])
amap = {old: i for i, old in enumerate(sorted(used))}
acc = [j['accessors'][o] for o in sorted(used)]
bvused = set(a['bufferView'] for a in acc) | set(i['bufferView'] for i in j.get('images', []) if 'bufferView' in i)
bvmap = {}; out = bytearray(); bvs = []
for o in sorted(bvused):
    bv = dict(j['bufferViews'][o]); off = bv.get('byteOffset', 0)
    while len(out) % 4: out.append(0)
    bvmap[o] = len(bvs); data = binb[off:off + bv['byteLength']]; bv['byteOffset'] = len(out); out += data; bvs.append(bv)
while len(out) % 4: out.append(0)
for a in acc: a['bufferView'] = bvmap[a['bufferView']]
for i in j.get('images', []):
    if 'bufferView' in i: i['bufferView'] = bvmap[i['bufferView']]
for m in j['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = amap[p['indices']]
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = amap[s['inverseBindMatrices']]
for a in j.get('animations', []):
    for s in a['samplers']: s['input'] = amap[s['input']]; s['output'] = amap[s['output']]
j['accessors'] = acc; j['bufferViews'] = bvs; j['buffers'] = [{'byteLength': len(out)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
total = 12 + 8 + len(js) + 8 + len(out)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out))
print(dst, total)
