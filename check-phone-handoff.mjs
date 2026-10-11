import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';

const origin='https://survive-drive-valhalla.choppy777.chatgpt.site';
const gpx='<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="RS" xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="25.722505" lon="-80.290148"><name>Turn &amp; stop 🐈</name></wpt><trk><name>Chosen &amp; exact</name><trkseg><trkpt lat="25.722505123" lon="-80.290148123"/><trkpt lat="25.723506456" lon="-80.289148456"/><trkpt lat="25.724506789" lon="-80.288148789"/></trkseg></trk></gpx>';
const route={gpx,points:3,turns:1,expected_endpoints:{origin:[25.722505123,-80.290148123],destination:[25.724506789,-80.288148789]},route_name:'Chosen & exact 🐈',filename:'survive-drive-king-of-the-hill-offline-proof.gpx'};
function bucket(){const data=new Map();return {data,async put(k,value,options){data.set(k,{value,...options});},async get(k){const entry=data.get(k);return entry?{async json(){return JSON.parse(entry.value);}}:null;},async list({prefix,limit}){return{objects:[...data.entries()].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([key,entry])=>({key,customMetadata:entry.customMetadata}))};},async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])data.delete(k);}};}
const source=readFileSync('server/phone-handoff.js','utf8')+'\n'+readFileSync('server/worker.js','utf8');
let external=0;
function worker(code){const c={crypto:webcrypto,Request,Response,Headers,URL,TextEncoder,TextDecoder,atob,fetch(){external++;throw Error('External fetch forbidden');},console};vm.createContext(c);vm.runInContext(code.replace(/export (?=(?:async )?function )/g,'').replace('export default','globalThis.worker ='),c);return c.worker;}
async function verifyServer(w){
  const storage=bucket(),env={TUTORIAL_MEDIA:storage};
  async function call(action,body,options={}){const headers={'Content-Type':'application/json',Origin:origin,...options.headers};const request=new Request(origin+'/api/phone-handoff/'+action,{method:options.method??'POST',headers,...(options.method==='GET'?{}:{body:JSON.stringify(body)})});const response=await w.fetch(request,env);return{status:response.status,body:await response.json()};}
  const made=await call('create',route);assert.equal(made.status,201,JSON.stringify(made.body));assert.equal(made.body.provider_calls,0);assert.equal(new URL(made.body.url).pathname,'/phone-route.html');assert.equal(new URL(made.body.url).search,'');assert.equal(new URL(made.body.url).hash,'#'+made.body.token);
  const received=await call('read',{token:made.body.token});assert.equal(received.status,200);assert.equal(received.body.gpx,gpx);assert.equal(received.body.points,3);assert.equal(received.body.turns,1);assert.equal(Date.parse(received.body.expires_at)-Date.parse(received.body.created_at),86400000);
  const expected=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(gpx))).toString('hex');assert.equal(received.body.sha256,expected);
  const again=await call('create',route);assert.notEqual(again.body.token,made.body.token,'handoffs are immutable separate snapshots');
  assert.equal((await call('read',{token:made.body.token},{headers:{Origin:'https://other.example'}})).status,403);
  assert.equal((await call('read',{token:made.body.token},{headers:{Origin:''}})).status,403);
  assert.equal((await call('read',{}, {method:'GET'})).status,405);
  assert.equal((await call('unknown',{})).status,404);
  for(const invalid of [{...route,expected_endpoints:null},{...route,expected_endpoints:{...route.expected_endpoints,destination:[26,-80]}},{...route,points:2},{...route,gpx:gpx.replace('25.722505123','91')},{...route,gpx:'<!DOCTYPE gpx>'+gpx},{...route,turns:-1},{...route,filename:'../route.gpx'},{...route,gpx:gpx+' '.repeat(2*1024*1024)}])assert.equal((await call('create',invalid)).status,400);
  assert.equal((await call('read',{token:'bad'})).status,400);
  const expiredKey='rs-phone-handoffs/v1/'+made.body.token,entry=storage.data.get(expiredKey),packet=JSON.parse(entry.value);packet.expires_at='2000-01-01T00:00:00Z';entry.value=JSON.stringify(packet);
  assert.equal((await call('read',{token:made.body.token})).status,410);assert.equal(storage.data.has(expiredKey),false);
  assert.equal((await call('delete',{token:again.body.token})).body.revoked,true);assert.equal((await call('read',{token:again.body.token})).status,404);
  storage.data.set('tutorials/keep-me.mp4',{value:'untouched',customMetadata:{expires_at:'1'}});storage.data.set('rs-phone-handoffs/v1/20000101-old',{value:'old',customMetadata:{expires_at:'1'}});
  await call('create',route);assert.equal(storage.data.has('tutorials/keep-me.mp4'),true);assert.equal(storage.data.has('rs-phone-handoffs/v1/20000101-old'),false);
  const unavailable=await w.fetch(new Request(origin+'/api/phone-handoff/create',{method:'POST',headers:{Origin:origin},body:JSON.stringify(route)}),{});assert.equal(unavailable.status,503);
  return{call,packet:received.body};
}
const sourceProof=await verifyServer(worker(source));
const built=worker(readFileSync('dist/server/index.js','utf8'));await verifyServer(built);
for(const path of ['/phone-route.html','/phone-route.js','/phone-handoff.js','/phone-route.css','/qrcode.js']){const r=await built.fetch(new Request(origin+path),{});assert.equal(r.status,200,path);assert.ok((await r.text()).length>100);}
assert.equal(external,0,'no provider or external calls');

// Decode the actual local QR matrix using a separate QR reader.
const link=origin+'/phone-route.html#20261011-12345678-1234-4234-8234-123456789abc',qr=qrcode(0,'M');qr.addData(link,'Byte');qr.make();
const scale=6,border=4,n=(qr.getModuleCount()+border*2)*scale,pixels=new Uint8ClampedArray(n*n*4);
for(let y=0;y<n;y++)for(let x=0;x<n;x++){const row=Math.floor(y/scale)-border,col=Math.floor(x/scale)-border,dark=row>=0&&col>=0&&row<qr.getModuleCount()&&col<qr.getModuleCount()&&qr.isDark(row,col),i=(y*n+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=dark?0:255;pixels[i+3]=255;}
assert.equal(jsQR(pixels,n,n).data,link,'phone camera receives the complete handoff URL');

class Element{constructor(){this.children=[];this.listeners={};this.disabled=false;this.hidden=false;this.value='';}append(...a){this.children.push(...a);}replaceChildren(...a){this.children=a;}setAttribute(){}addEventListener(k,f){this.listeners[k]=f;}focus(){}select(){}}
const panel=new Element();let calls=[],resolveCreate,resolveDelete,delayed=false,copied='';
const ctx={URL,Blob,TextEncoder,crypto:webcrypto,qrcode,location:{origin},navigator:{clipboard:{async writeText(v){copied=v;}}},document:{createElement(){return new Element();}},chosenOsmAndGpx(){return{xml:gpx,filename:route.filename,points:3,turns:1,expected_endpoints:route.expected_endpoints};},async fetch(url,options){calls.push({url,body:JSON.parse(options.body)});const body=url.endsWith('create')?{token:'20261011-12345678-1234-4234-8234-123456789abc',url:link,route_name:route.route_name}: {revoked:true};if(delayed)await new Promise(resolve=>{if(url.endsWith('create'))resolveCreate=resolve;else resolveDelete=resolve;});return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(readFileSync('dist/phone-handoff.js','utf8'),ctx);
class EndpointDOMParser{parseFromString(xml){const points=[...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"\/>/g)].map(m=>({parentNode:{localName:'trkseg'},hasAttribute(k){return k==='lat'||k==='lon';},getAttribute(k){return m[k==='lat'?1:2];}}));return{documentElement:{localName:'gpx',namespaceURI:'http://www.topografix.com/GPX/1/1'},getElementsByTagNameNS(){return points;},getElementsByTagName(){return[];}};}}
ctx.DOMParser=EndpointDOMParser;
const handoff=ctx.SurvivePhoneHandoff;
await handoff.validatePacket(sourceProof.packet);
await assert.rejects(handoff.validatePacket({...sourceProof.packet,expected_endpoints:{...route.expected_endpoints,destination:[26,-80]}}),/does not reach/);
await assert.rejects(handoff.validatePacket({...sourceProof.packet,expected_endpoints:null}),/no original Start/);
handoff.installDesktop(panel);const [send,status,result]=panel.children[0].children,choice={candidate_id:'A',chosen_at:'now',osmand_track:{name:route.route_name}};
handoff.renderDesktop({choice,chosenSelected:false,busy:false});assert.equal(send.disabled,true);
handoff.renderDesktop({choice,chosenSelected:true,busy:false});await handoff.sendChosenToPhone();assert.equal(result.hidden,false);assert.equal(calls[0].body.gpx,gpx);assert.equal(result.children[3].children[0].value,link);
await result.children[4].listeners.click();assert.equal(copied,link);
assert.equal(decodeURIComponent(handoff.androidIntent(gpx,origin).match(/;S.gpx=([^;]+);/)[1]),gpx);
assert.equal(handoff.androidIntent('x'.repeat(240001),origin),null,'large paths go through full-file fallback');
await result.children[5].listeners.click();assert.equal(result.hidden,true);assert.equal(calls.at(-1).url,'/api/phone-handoff/delete');
delayed=true;const pending=handoff.sendChosenToPhone();const count=calls.length;await handoff.sendChosenToPhone();assert.equal(calls.length,count,'double clicks do not duplicate uploads');handoff.renderDesktop({choice:{...choice,candidate_id:'B'},chosenSelected:true,busy:true});resolveCreate();await pending;assert.equal(result.hidden,true,'a stale upload never labels a different chosen route');assert.equal(send.disabled,true,'a running route operation keeps the handoff disabled');
assert.ok(calls.every(c=>c.url.startsWith('/api/phone-handoff/')));
// Receiver controller tests use Android identification and real intent/file helpers.
const receiverSource=readFileSync('dist/phone-route.js','utf8').replace('window.addEventListener(\'hashchange\',load);load();',"window.addEventListener('hashchange',load);globalThis.initialLoad=load();");
async function receiver(packet,error=null){
  const nodes=new Map(),events={},downloads=[];const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  Element.prototype.removeAttribute=function(k){delete this[k];};
  const c={location:{origin,hash:'#20261011-12345678-1234-4234-8234-123456789abc'},navigator:{userAgent:'Mozilla/5.0 Android'},document:{getElementById:get},SurvivePhoneHandoff:{tokenValid:handoff.tokenValid,androidIntent:handoff.androidIntent,async api(){if(error)throw Error(error);return packet;},async validatePacket(p){return p;},download(...args){downloads.push(args);}},addEventListener(k,fn){events[k]=fn;}};c.window=c;vm.createContext(c);vm.runInContext(receiverSource,c);await c.initialLoad;return{get,c,downloads};
}
const received={...route,expires_at:new Date(Date.now()+86400000).toISOString()};
const small=await receiver(received);assert.equal(small.get('received-route').hidden,false);assert.equal(small.get('phone-send-osmand').hidden,false);assert.equal(small.get('phone-download-handoff').hidden,true);assert.equal(decodeURIComponent(small.get('phone-send-osmand').href.match(/;S.gpx=([^;]+);/)[1]),gpx);
small.get('phone-send-osmand').listeners.click();assert.match(small.get('phone-launch-status').textContent,/cannot confirm/);
const large=await receiver({...received,gpx:gpx+' '.repeat(240001)});assert.equal(large.get('phone-send-osmand').hidden,true);assert.equal(large.get('phone-download-handoff').hidden,false);large.get('phone-download-handoff').listeners.click();assert.equal(large.downloads[0][0],gpx+' '.repeat(240001));assert.equal(large.downloads[0][2],true);
large.get('phone-download-gpx').listeners.click();assert.equal(large.downloads[1][2],false);
const failed=await receiver(received,'This route link expired. Send it again from desktop RS.');assert.equal(failed.get('received-route').hidden,true);assert.equal(failed.get('retry-phone-route').hidden,false);assert.match(failed.get('phone-route-status').textContent,/expired/);
console.log('Passed source and built Worker handoff: byte-exact GPX, unique snapshots, SHA-256, expiry, revoke, namespace-only cleanup, same-origin guards, bounded inputs, assets; local QR decoded; chosen-route UI, copy, large path fallback, double-click and stale-selection guards. Provider calls: 0.');


