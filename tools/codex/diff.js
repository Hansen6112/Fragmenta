// node diff.js old.json new.json -> entity-level change list
const fs=require('fs');const A=JSON.parse(fs.readFileSync(process.argv[2])),B=JSON.parse(fs.readFileSync(process.argv[3]));
const ch=[];const s=x=>JSON.stringify(x);
const isObj=v=>v&&typeof v==='object';
for(const reg of new Set([...Object.keys(A),...Object.keys(B)])){
 const a=A[reg]?.value,b=B[reg]?.value;
 if(a===undefined){ch.push({reg,type:'registry added'});continue}
 if(b===undefined){ch.push({reg,type:'registry removed'});continue}
 if(s(a)===s(b))continue;
  const prim=v=>Array.isArray(v)&&v.every(x=>!isObj(x));
 if(prim(a)&&prim(b)){const sa=new Set(a.map(s)),sb=new Set(b.map(s));for(const x of sb)if(!sa.has(x))ch.push({reg,id:JSON.parse(x),type:'member added'});for(const x of sa)if(!sb.has(x))ch.push({reg,id:JSON.parse(x),type:'member removed'});continue}
 if(isObj(a)&&isObj(b)){
  const keyOf=(v,i)=>Array.isArray(v)?(v[i]?.id??v[i]?.key??v[i]?.name??i):i;
  const map=v=>Object.fromEntries((Array.isArray(v)?v.map((x,i)=>[keyOf(v,i),x]):Object.entries(v)));
  const ma=map(a),mb=map(b);
  for(const k of new Set([...Object.keys(ma),...Object.keys(mb)])){
   if(!(k in ma))ch.push({reg,id:k,type:'added'});else if(!(k in mb))ch.push({reg,id:k,type:'removed'});
   else if(s(ma[k])!==s(mb[k])){const fa=ma[k],fb=mb[k];const fields=isObj(fa)&&isObj(fb)?[...new Set([...Object.keys(fa),...Object.keys(fb)])].filter(f=>s(fa[f])!==s(fb[f])):['(value)'];
     ch.push({reg,id:k,type:'changed',fields:fields.map(f=>({f,old:isObj(fa)?fa[f]:fa,new:isObj(fb)?fb[f]:fb}))})}}
 }else ch.push({reg,type:'changed',old:a,new:b});}
console.log(JSON.stringify(ch,null,1));
