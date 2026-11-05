/* Standalone adapter: gives the page the same window.claude API it gets inside claude.ai,
   backed by this repo's server (/api/*). Does nothing when running inside claude.ai. */
(()=>{if(window.claude)return;
const TK='tx_token',tok=()=>{try{return localStorage.getItem(TK)||''}catch(e){return''}};
let loginP=null;
const login=()=>new Promise(res=>{const d=document.createElement('dialog');d.style.cssText='border-radius:14px;padding:18px;border:1px solid #ccc';
 d.innerHTML='<form method="dialog" style="display:grid;gap:10px;min-width:260px"><b>กรอกรหัสเข้าใช้งาน</b><input type="password" style="padding:8px" autofocus><button style="padding:8px;background:#f97316;color:#fff;border:0;border-radius:8px">เข้าสู่ระบบ</button></form>';
 document.body.appendChild(d);d.showModal();d.querySelector('form').onsubmit=()=>{const v=d.querySelector('input').value;setTimeout(()=>{d.remove();res(v)})}});
async function api(path,opt={}){for(let i=0;i<3;i++){
 const r=await fetch(path,{...opt,headers:{'Content-Type':'application/json','X-App-Token':tok()}});
 if(r.status===401){loginP=loginP||login().finally(()=>{loginP=null});const v=await loginP;try{localStorage.setItem(TK,v)}catch(e){}continue}
 if(!r.ok){let m='';try{m=(await r.json()).error}catch(e){}throw{code:r.status===429?'rate_limited':'unavailable',message:m||'HTTP '+r.status}}
 return r}
 throw{code:'not_granted',message:'รหัสเข้าใช้งานไม่ถูกต้อง'}}
const b64=b=>new Promise(ok=>{const f=new FileReader();f.onload=()=>ok(String(f.result).split(',')[1]);f.readAsDataURL(b)});
const sample=Object.assign(async()=>{throw{code:'unavailable',message:'use sample.json'}},{
 limits:async()=>({images:true}),
 json:async(prompt,o={})=>{const images=await Promise.all((o.images||[]).map(b64));
  const r=await api('/api/extract',{method:'POST',body:JSON.stringify({prompt,images})});
  let j;try{j=JSON.parse(await r.text())}catch(e){throw{code:'unavailable',message:'ตอบกลับไม่ถูกต้อง'}}
  if(j.error)throw{code:'unavailable',message:j.error};return j.data}});
const col=name=>({
 onSnapshot(next,err){let last=null,busy=false,iv;
  const tick=async()=>{if(busy)return;busy=true;try{const j=await(await api('/api/'+name)).json(),s=JSON.stringify(j.rows);
    if(s!==last){last=s;next({docs:j.rows.map(x=>({id:x.id,exists:true,data:()=>({code:x.code,title:x.title})})),size:j.rows.length,empty:!j.rows.length,metadata:{fromCache:false}})}}
   catch(e){err&&err(e);if(e&&e.code==='not_granted')clearInterval(iv)}finally{busy=false}};
  tick();iv=setInterval(tick,6000);addEventListener('tx-refresh',tick);
  return()=>{clearInterval(iv);removeEventListener('tx-refresh',tick)}},
 doc:id=>({
  set:async d=>{await api(`/api/${name}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(d)});dispatchEvent(new Event('tx-refresh'))},
  delete:async()=>{await api(`/api/${name}/${encodeURIComponent(id)}`,{method:'DELETE'});dispatchEvent(new Event('tx-refresh'))}})});
const downloads={save:async({filename,data})=>{const t=filename.endsWith('.html')?'text/html':'text/csv';
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:t+';charset=utf-8'}));a.download=filename;
 document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}};
const user={isOwner:()=>false,canEdit:()=>true};
const M={sample,db:{collection:col},downloads,user};
window.claude={use:async n=>M[n]||null};
})();
