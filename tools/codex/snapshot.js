// Usage: node snapshot.js <repoDir> <out.json>  -- loads the game's scripts like tools/audit.js and dumps data registries
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(process.argv[2]);const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]).filter(s=>s.startsWith('js/data/'));
const el=()=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>'':(k in t?t[k]:el()),apply:()=>el(),construct:()=>el(),set:()=>true});
const ctx={console:{log(){},warn(){},error(){}},Math,JSON,Date,Object,Array,String,Number,Set,Map,document:el(),window:{},localStorage:{getItem(){return null},setItem(){}}};
ctx.window=ctx;vm.createContext(ctx);
const names=[];
for(const s of scripts){const src=fs.readFileSync(path.join(ROOT,s),'utf8');
  for(const m of src.matchAll(/^(?:const|let|var)\s+([A-Z_][A-Z0-9_]*)\s*=/gm))names.push([m[1],s]);
  try{vm.runInContext(src,ctx,{filename:s})}catch(e){console.error('load fail',s,e.message)}}
const out={};for(const[n,s]of names){try{const v=vm.runInContext(n,ctx);if(typeof v!=='function')out[n]={file:s,value:JSON.parse(JSON.stringify(v,(k,x)=>typeof x==='function'?'[fn]':x))}}catch(e){}}
fs.writeFileSync(process.argv[3],JSON.stringify(out));console.log('registries',Object.keys(out).length);
