const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext('const ENG = {Fighter: class Fighter {hurtbox(){return {x:this.x};}}};'+fs.readFileSync('js/net-codec.js','utf8')+`
const a=new ENG.Fighter(),b=new ENG.Fighter();a.x=12;b.x=45;a.enemy=b;b.enemy=a;a.hitSet=new Set([b]);a.life=Infinity;
const original={fighters:[a,b],winner:b};const result=NetCodec.decode(NetCodec.encode(original));
globalThis.test={cycle:result.fighters[1].enemy===result.fighters[0],winner:result.winner===result.fighters[1],set:result.fighters[0].hitSet.has(result.fighters[1]),infinity:result.fighters[0].life===Infinity,prototype:result.fighters[0].hurtbox().x===12};`,sandbox);
for(const [k,v] of Object.entries(sandbox.test))assert.equal(v,true,k);
console.log('PASS network snapshot cycles, fighter prototypes, Sets, Infinity, and shared identities');
