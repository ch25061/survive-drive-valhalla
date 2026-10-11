import assert from 'node:assert/strict';
import {createHostedGateway} from '../local/hosted-gateway.mjs';
import {valhallaRequestHeaders,valhallaHighwayCellMasks} from '../server/valhalla-provider.js';
import worker from '../dist/server/index.js';

const secret='a'.repeat(64),requests=[],route={trip:{legs:[{shape:"_cmemA~z`}dD_c`|@?",summary:{length:1,time:20}}]}};
assert.throws(()=>createHostedGateway({secret:'short'}));
assert.throws(()=>valhallaRequestHeaders(undefined));
const gateway=createHostedGateway({secret,fetchImpl:async(url,options)=>{requests.push({url:String(url),options});return new Response(JSON.stringify(route));}});
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+gateway.address().port,authorization=valhallaRequestHeaders(secret);
try{
  assert.equal((await fetch(origin+'/status')).status,401);
  assert.equal((await fetch(origin+'/status',{headers:{Authorization:'Bearer '+('b'.repeat(64))}})).status,401);
  assert.equal(requests.length,0,'unauthenticated requests never reach the engine');
  assert.equal((await fetch(origin+'/unsupported',{headers:authorization})).status,404);
  const payload={locations:[{lat:41,lon:-87},{lat:42,lon:-87}],costing:'auto',alternates:0,exclude_polygons:[[[-87,41],[-86.99,41],[-86.99,41.01],[-87,41]]]};
  assert.equal((await fetch(origin+'/route',{method:'POST',headers:{...authorization,'Content-Type':'application/json'},body:JSON.stringify(payload)})).status,200);
  assert.equal(requests.length,1);assert.equal(requests[0].url,'http://127.0.0.1:8002/route');
  assert.deepEqual(JSON.parse(requests[0].options.body),payload,'gates/exclusions are not altered');
  assert.equal(requests[0].options.headers.Authorization,undefined,'the key is never sent to the raw engine');
  assert.equal((await fetch(origin+'/route',{method:'POST',headers:{...authorization,'Content-Type':'application/json'},body:'{}'})).status,400);
  assert.equal((await fetch(origin+'/route',{method:'POST',headers:{...authorization,'Content-Type':'application/json'},body:' '.repeat(2*1024*1024+1)})).status,413);
  const tile=encodeURIComponent(JSON.stringify({tile:{z:12,x:1,y:2}}));
  assert.equal((await fetch(origin+'/tile?json='+tile,{headers:authorization})).status,200);
  assert.equal(requests[1].url.startsWith('http://127.0.0.1:8002/tile?'),true);
  assert.equal((await fetch(origin+'/tile?json='+encodeURIComponent(JSON.stringify({tile:{z:12,x:-1,y:2}})),{headers:authorization})).status,400);
}finally{await new Promise(resolve=>gateway.close(resolve));}

let tileAttempts=0;
await valhallaHighwayCellMasks({cells:[{cell_id:'fixture',polygon:[[0,0],[0.001,0],[0.001,0.001],[0,0.001],[0,0]]}]},'https://routing.example.com',{headers:authorization,fetchImpl:async(url,options)=>{tileAttempts++;assert.equal(options.headers.Authorization,'Bearer '+secret);assert.equal(String(url).includes(secret),false);return new Response(new Uint8Array());}});
assert.ok(tileAttempts>0);

const claims=new Set(),env={VALHALLA_BASE_URL:'https://routing.example.com',VALHALLA_API_KEY:secret,DB:{prepare(){return {bind(id){return {async first(){if(claims.has(id))return null;claims.add(id);return {round_id:id};}};}};}}};
const body={approved:true,round_id:'desktop-fixture-0001',params:{transportMode:'car',origin:'41,-87',destination:'42,-87',routingMode:'fast',departureTime:'any',alternatives:0,return:'polyline,summary,turnByTurnActions,routeLabels',spans:'streetAttributes,names,routeNumbers,functionalClass'}};
const makeRequest=()=>new Request('https://rs.example.com/api/providers/valhalla',{method:'POST',headers:{Origin:'https://rs.example.com','Content-Type':'application/json'},body:JSON.stringify(body)});
const actualFetch=globalThis.fetch;let attempts=0;
globalThis.fetch=async(url,options)=>{attempts++;assert.equal(options.headers.Authorization,'Bearer '+secret);assert.equal(options.body.includes(secret),false);return new Response(JSON.stringify(route));};
try{
  assert.equal((await worker.fetch(makeRequest(),{...env,VALHALLA_API_KEY:undefined})).status,428);
  assert.equal(claims.size,0);assert.equal(attempts,0,'missing protection never spends a round');
  const result=await worker.fetch(makeRequest(),env);assert.equal(result.status,200);assert.equal((await result.text()).includes(secret),false);
  assert.equal((await worker.fetch(makeRequest(),env)).status,409);assert.equal(attempts,1,'a repeated round never retries the engine');
  body.round_id='desktop-fixture-0002';globalThis.fetch=async()=>{attempts++;throw Error('network failure');};
  const failure=await worker.fetch(makeRequest(),env);assert.equal(failure.status,502);assert.equal((await failure.text()).includes(secret),false);
  assert.equal((await worker.fetch(makeRequest(),env)).status,409);assert.equal(attempts,2);
  const statusRequest=()=>new Request('https://rs.example.com/api/providers/status');
  const spent=claims.size;let healthChecks=0;
  globalThis.fetch=async(url,options)=>{healthChecks++;assert.equal(new URL(url).pathname,'/status');assert.equal(options.headers.Authorization,'Bearer '+secret);assert.equal(options.method,undefined);assert.equal(options.redirect,'manual','Worker health checks reject redirects without an unsupported redirect mode');return new Response(JSON.stringify({version:'3.9.0'}));};
  assert.equal((await (await worker.fetch(statusRequest(),env)).json()).valhalla_ready,true);
  globalThis.fetch=async()=>{healthChecks++;return new Response('{}',{status:502});};
  const unavailable=await (await worker.fetch(statusRequest(),env)).json();
  assert.equal(unavailable.valhalla_ready,false);assert.equal(unavailable.valhalla_configured,true);
  assert.match(unavailable.valhalla_connection_error,/desktop Valhalla engine is unavailable.*HTTP 502/);
  globalThis.fetch=async()=>{healthChecks++;return new Response('{}',{status:401});};
  const rejected=await (await worker.fetch(statusRequest(),env)).json();
  assert.match(rejected.valhalla_connection_error,/authentication.*HTTP 401/);
  assert.equal(JSON.stringify(rejected).includes(secret),false);
  globalThis.fetch=async()=>{healthChecks++;throw new DOMException('private upstream details','TimeoutError');};
  const timeout=await (await worker.fetch(statusRequest(),env)).json();
  assert.match(timeout.valhalla_connection_error,/timed out/);
  assert.equal(JSON.stringify(timeout).includes('private upstream details'),false);
  globalThis.fetch=async()=>{healthChecks++;return new Response('<html>Sign in</html>');};
  assert.equal((await (await worker.fetch(statusRequest(),env)).json()).valhalla_ready,false);
  assert.equal((await (await worker.fetch(statusRequest(),{...env,VALHALLA_API_KEY:undefined})).json()).valhalla_ready,false);
  assert.equal(healthChecks,5);assert.equal(claims.size,spent,'health checks do not reserve or replay route rounds');
}finally{globalThis.fetch=actualFetch;}
console.log('Desktop gateway: authentication, exact payloads, bounded requests, road tiles, and one-attempt Worker claims passed. Live provider requests: 0.');
