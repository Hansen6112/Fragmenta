// node render.js snapshot.json outDir  -> items_codex.html, enemy_codex.html, entries.json
// Deterministic: every entry is rendered from the game data, never written by hand.
const fs=require('fs'),path=require('path');
const S=JSON.parse(fs.readFileSync(process.argv[2]));const out=process.argv[3];fs.mkdirSync(out,{recursive:true});
const V=n=>S[n]?.value||{};const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const EFF=V('EFFECT_DEFS'),RAR=V('ITEM_RARITY_NAMES'),AB=V('ENEMY_ABILITIES'),ST=V('STATUS_EFFECTS'),LAB=V('STAT_LABELS');
const stat=k=>LAB[k]||k;const bon=b=>Object.entries(b||{}).map(([k,v])=>`${stat(k)} ${v>=0?'+':''}${v}`).join(', ')||'none';
const effName=e=>EFF[e]?.name||e;
const brief=o=>Object.entries(o).filter(([k])=>!['name','type'].includes(k)).map(([k,v])=>`${k}: ${typeof v==='object'?JSON.stringify(v):v}`).join('; ');
const entries={items:{},enemies:{},abilities:{},statuses:{}};
// ---------- ITEMS ----------
const SLOTORDER=['mainhand','offhand','helmet','chest','gloves','boots','rings','necklace','cloak','trinkets'];
let h=`<h1>Fragmenta Item &amp; Equipment Codex (Live)</h1><p><b>Generated from the game code</b> (js/data/items.js ITEM_DEFS, effects.js, sets.js). Maintained nightly by the Codex Tracker agent: each entry below mirrors the code exactly. The code is the source of truth; canon conflicts are listed in the Codex Change Log's Canon Flags tab, not changed here.</p><p><b>Canon flag:</b> the code names tier 6 "${esc(RAR['6'])}"; owner ruling OD-01 says the active tier label is Relic.</p>`;
const items=Object.entries(V('ITEM_DEFS'));
for(const t of Object.keys(RAR).sort((a,b)=>a-b)){
  const tier=items.filter(([,v])=>String(v.tier)===t);if(!tier.length)continue;
  h+=`<h2>Tier ${t} — ${esc(RAR[t])} (${tier.length} items)</h2>`;
  const slots=[...new Set(tier.map(([,v])=>v.slot))].sort((a,b)=>(SLOTORDER.indexOf(a)+99)%99-(SLOTORDER.indexOf(b)+99)%99);
  for(const sl of slots){h+=`<h3>${esc(sl||'other')}</h3>`;
    for(const[n,v]of tier.filter(([,v])=>v.slot===sl).sort((a,b)=>a[0].localeCompare(b[0]))){
      const parts=[`Tier ${v.tier} ${RAR[v.tier]||''}`,`slot ${v.slot}`,`bonuses: ${bon(v.bonuses)}`];
      if(v.effects?.length)parts.push(`effects: ${v.effects.map(effName).join(', ')}`);
      if(v.set)parts.push(`set: ${v.set}`);parts.push(`source: ${v.source}`);if(v.region)parts.push(`region: ${v.region}`);
      if(v.useEffect)parts.push(`use: ${JSON.stringify(v.useEffect)}`);if(v.teachesRecipe)parts.push(`teaches recipe: ${v.teachesRecipe}`);
      if(v.teachesSchematic)parts.push(`teaches schematic: ${v.teachesSchematic}`);if(v.revives)parts.push('revives an ally');
      const text=`${n} — ${parts.join(' · ')}`;entries.items[n]={section:`Tier ${t} › ${sl}`,text};
      h+=`<p><b>${esc(n)}</b> — ${esc(parts.join(' · '))}</p>`;}}}
fs.writeFileSync(path.join(out,'items_codex.html'),h);
// ---------- ENEMIES ----------
const abLine=id=>{const a=AB[id];return a?`${a.name} (${a.type}) — ${brief(a)}`:`${id} (not in ENEMY_ABILITIES)`};
let e=`<h1>Fragmenta Enemy Codex (Live)</h1><p><b>Generated from the game code</b> (js/data/bestiary.js BESTIARY, enemyabilities.js). Maintained nightly by the Codex Tracker agent. Gameplay statblocks only; narrative creature lore stays in the Bestiary family (OD-02). Stats are species base values before PLAYER_STAT_SCALE and Danger Class multipliers.</p>`;
const B=Object.entries(V('BESTIARY'));const DC=['normal','elite','boss','world_boss',undefined];
for(const dc of [...new Set([...DC,...B.map(([,v])=>v.dangerClass)])]){
  const grp=B.filter(([,v])=>v.dangerClass===dc);if(!grp.length)continue;
  e+=`<h2>Danger Class: ${esc(dc||'unclassified / special')} (${grp.length})</h2>`;
  for(const[id,v]of grp.sort((a,b)=>a[1].name.localeCompare(b[1].name))){
    const L=[];L.push(`ID ${id} · native: ${v.native}`+(v.faction?` · faction: ${v.faction}`:'')+(v.archetype?` · archetype: ${v.archetype}`:'')+(v.spawnRarity?` · spawn: ${v.spawnRarity}`:'')+(v.levelRange?` · levels ${JSON.stringify(v.levelRange)}`:''));
    L.push(`Stats: HP ${v.hp} · Attack ${v.atk} · Defense ${v.def}`+(v.magic!=null?` · Magic ${v.magic}`:'')+` · Speed ${v.spd} · Accuracy ${v.acc} · Agility ${v.agi}`+(v.flurry?` · flurry ${JSON.stringify(v.flurry)}`:''));
    L.push(`Tags: ${(v.tags||[]).join(', ')}`+(v.nations?` · nations: ${v.nations.join(', ')}`:'')+(v.group?` · group: ${v.group}`:'')+(v.spawnGroup?` · spawn group: ${JSON.stringify(v.spawnGroup)}`:''));
    if(v.passives?.length)L.push(...v.passives.map(p=>`Passive: ${abLine(p)}`));
    if(v.actives?.length)L.push(...v.actives.map(p=>`Active: ${abLine(p)}`));
    if(v.bossKit)L.push(`Boss kit: ${v.bossKit} (engine state controller)`);
    if(v.equipment)L.push(`Equipment: ${typeof v.equipment==='object'?Object.entries(v.equipment).map(([s,i])=>`${s}: ${Array.isArray(i)?i.join(', '):i}`).join(' · '):v.equipment}`);
    L.push(`Description: ${v.description}`);L.push(`Combat notes: ${v.combatNotes}`);
    entries.enemies[id]={name:v.name,section:`Danger Class: ${dc||'unclassified / special'}`,lines:L};
    e+=`<h3>${esc(v.name)}</h3>`+L.map(x=>`<p>${esc(x)}</p>`).join('');}}
e+=`<h2>Appendix A — Enemy Abilities (${Object.keys(AB).length})</h2>`;
for(const[id,a]of Object.entries(AB).sort((x,y)=>x[1].name.localeCompare(y[1].name))){const t=`${a.name} [${id}] (${a.type}) — ${brief(a)}`;entries.abilities[id]=t;e+=`<p>${esc(t)}</p>`;}
e+=`<h2>Appendix B — Status Effects (${Object.keys(ST).length})</h2>`;
for(const[id,s]of Object.entries(ST)){const t=`${s.name} [${id}] — ${brief(s)}`;entries.statuses[id]=t;e+=`<p>${esc(t)}</p>`;}
fs.writeFileSync(path.join(out,'enemy_codex.html'),e);
fs.writeFileSync(path.join(out,'entries.json'),JSON.stringify(entries));
console.log('items',Object.keys(entries.items).length,'enemies',Object.keys(entries.enemies).length,'abilities',Object.keys(entries.abilities).length);
