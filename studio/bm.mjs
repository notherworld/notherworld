import { readFileSync } from 'node:fs';
import init, { Scope } from './src/owos/owos_wasm.js';
await init(readFileSync('./src/owos/owos_wasm_bg.wasm'));
const spec = JSON.parse(readFileSync('./src/atlas/world.json','utf8'));
for (const seed of [20,21,22,23]) {
  spec.rng_seed = seed;
  let s; try { s = new Scope(JSON.stringify(spec)); } catch(e){ console.log('SEED',seed,'FAIL:',String(e).slice(0,120)); continue; }
  const N=110; const cnt={water:0,forest:0,desert:0,rock:0,snow:0,buildable:0,land:0};
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const x=(i+.5)/N,y=(j+.5)/N;
    if(s.sample_field('water',x,y)>=.5){cnt.water++;continue;} cnt.land++;
    if(s.sample_field('snow',x,y)>=.5)cnt.snow++;
    if(s.sample_field('rock',x,y)>=.5)cnt.rock++;
    if(s.sample_field('forest',x,y)>=.5)cnt.forest++;
    if(s.sample_field('desert',x,y)>=.5)cnt.desert++;
    if(s.sample_field('buildable',x,y)>=.5)cnt.buildable++;
  }
  const lp=k=>cnt.land?((cnt[k]/cnt.land)*100).toFixed(0):'0';
  const grass=cnt.buildable-cnt.forest-cnt.desert;
  console.log(`seed ${seed}: BUILD ${lp('buildable')}% (grass~${((grass/cnt.land)*100).toFixed(0)}% forest ${lp('forest')}% desert ${lp('desert')}%) rock ${lp('rock')}% snow ${lp('snow')}%`);
}
