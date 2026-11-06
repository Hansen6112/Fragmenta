// Proposed tools/expectedgear.js. Run from the repo root: node tools/expectedgear.js out.json
// Prints per-band/archetype stat totals and writes the full named-item loadouts to out.json.
// Expected-gear profile: for each level band (-> item tier), archetype and slot,
// pick the REAL item whose archetype score is the median among common-source items.
const fs=require('fs'),vm=require('vm');const c={console,Math,Object,Infinity,Set,JSON};
let src='';for(const f of ['data/areaTypes','data/world','data/bestiary','data/creaturetags','data/factions','data/jobs','data/equipment','data/items']) src+=fs.readFileSync('js/'+f+'.js','utf8')+'\n;\n';
src+=`
// Only items a player can actually obtain today (v0.3): source tags alone are not reliable,
// so membership is by real acquisition path: shop stock, kill loot (capped at tier 4),
// job/dungeon loot lists, regional job loot, starter kits.
const REACHABLE=new Set();
for(const [n,d] of Object.entries(ITEM_DEFS)){
  if(d.source==='shop'||d.source==='starter')REACHABLE.add(n);
  if(d.source==='monster'&&d.tier<=4)REACHABLE.add(n);
  if(d.source==='job'&&d.region)REACHABLE.add(n);
}
for(const t in LOOT_BY_TIER)for(const n of LOOT_BY_TIER[t])REACHABLE.add(n);
const BANDS=[{band:'1-5',tier:1},{band:'6-11',tier:2},{band:'12-17',tier:3},{band:'18-25',tier:4}]; // matches tools/combatsim.js gearTier()
const ARCH={
 martial:{primary:['atk'],score:b=>(b.atk||0)+(b.def||0)+(b.health||0)/5+(b.accuracy||0)+(b.agility||0)},
 caster:{primary:['magic'],score:b=>(b.magic||0)+(b.def||0)+(b.health||0)/5+(b.knowledge||0)/2},
 apothecary:{primary:['knowledge'],score:b=>(b.knowledge||0)+(b.def||0)+(b.health||0)/5+(b.atk||0)/2},
};
const DEF_SLOTS=new Set(['helmet','chest','gloves','boots','cloak']); // armor: primary stat not required
const out={};
for(const {band,tier} of BANDS){out[band]={};
 for(const [a,cfg] of Object.entries(ARCH)){const loadout={},tot={atk:0,def:0,health:0,magic:0,knowledge:0,accuracy:0,agility:0};let pools={};const usedSets=new Set();
  for(const slot of EQUIP_SLOTS){
   let pool=Object.entries(ITEM_DEFS).filter(([n,d])=>d.slot===slot&&d.tier===tier&&REACHABLE.has(n));
   const all=pool.length;
   if(!DEF_SLOTS.has(slot)){const p=pool.filter(([n,d])=>cfg.primary.some(k=>(d.bonuses||{})[k]>0)); if(p.length)pool=p;}
   pool.sort((x,y)=>cfg.score(x[1].bonuses||{})-cfg.score(y[1].bonuses||{}));
   const cap=EQUIP_SLOT_CAPACITY[slot]||1;const picks=[];
   // median outward (m, m+1, m-1, m+2, ...), skipping items from a set already in the loadout
   if(pool.length){const m=Math.floor(pool.length/2);const order=[m];for(let d=1;d<pool.length;d++){if(m+d<pool.length)order.push(m+d);if(m-d>=0)order.push(m-d);}
    for(const i of order){if(picks.length>=cap)break;const it=pool[i];const st=it[1].set;if(st&&usedSets.has(st))continue;picks.push(it);if(st)usedSets.add(st);}}
   loadout[slot]=picks.map(([n,d])=>({name:n,bonuses:d.bonuses,set:d.set||null,effects:(d.effects||[]).length}));pools[slot]=pool.length+'/'+all;
   for(const [n,d] of picks)for(const k in tot)tot[k]+=(d.bonuses||{})[k]||0;}
  out[band][a]={totals:tot,loadout,pools};}}
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
for(const b in out){for(const a in out[b])console.log(b.padEnd(6),a.padEnd(11),JSON.stringify(out[b][a].totals));}
`;
vm.runInNewContext(src,Object.assign(c,{fs,process}));
