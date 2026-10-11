import assert from 'node:assert/strict';
import {createHostedGateway} from './local/hosted-gateway.mjs';
import {FLORIDA_BOUNDS} from './local/engine-selection.mjs';
const calls=[],regions=[{name:'Florida',bounds:FLORIDA_BOUNDS,base_url:'http://127.0.0.1:8100'}];
let unavailable=false;
const gateway=createHostedGateway({secret:'a'.repeat(64),regions,fetchImpl:async(url,options)=>{calls.push({url:String(url),options});if(unavailable)throw Error('offline fixture engine unavailable');return new Response(JSON.stringify({version:'3.9.0'}));}});
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+gateway.address().port,headers={Authorization:'Bearer '+'a'.repeat(64),'Content-Type':'application/json'};
try{
  const payload={costing:'auto',alternates:0,locations:[{lat:26.4619661,lon:-81.8035874},{lat:26.492866,lon:-81.862908,type:'via',radius:800,rank_candidates:false},{lat:26.2338608,lon:-81.7892969}],exclude_polygons:[[[-81.9,26.3],[-81.89,26.3],[-81.9,26.31],[-81.9,26.3]]]};
  const send=()=>fetch(base+'/route',{method:'POST',headers,body:JSON.stringify(payload)});
  assert.equal((await fetch(base+'/route',{method:'POST',body:JSON.stringify(payload)})).status,401);assert.equal(calls.length,0);
  assert.equal((await send()).status,200);assert.equal(calls[0].url,'http://127.0.0.1:8100/route');assert.deepEqual(JSON.parse(calls[0].options.body),payload,'All gates and exclusions reach one complete graph unchanged.');
  const lon=-81.789,lat=26.234,n=4096,x=Math.floor((lon+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
  assert.equal((await fetch(base+'/tile?json='+encodeURIComponent(JSON.stringify({tile:{z:12,x,y}})),{headers})).status,200);assert.match(calls.at(-1).url,/127\.0\.0\.1:8100\/tile/);
  assert.equal((await fetch(base+'/status',{headers})).status,200);assert.ok(calls.some(c=>c.url==='http://127.0.0.1:8100/status'));assert.equal(calls.at(-1).url,'http://127.0.0.1:8002/status');
  unavailable=true;const count=calls.length;assert.equal((await send()).status,502);assert.equal(calls.length,count+1,'An unavailable Florida engine is never retried on the city graph.');
  assert.equal((await fetch(base+'/status',{headers})).status,503,'Missing regional coverage must not be declared ready.');
}finally{await new Promise(resolve=>gateway.close(resolve));}
console.log('Protected Florida gateway passed: authentication, complete graph selection, gates/exclusions/road tiles, health and no retries.');
