import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {endpointCheckPayload,endpointCheckResult} from './server/valhalla-provider.js';
import worker from './dist/server/index.js';

const params={origin:'41.9015149,-87.830546',destination:'41.8411608,-87.665697'};
const payload=endpointCheckPayload(params);
assert.equal(payload.locations.length,2);assert.equal(payload.locations[0].search_cutoff,1600);assert.equal(payload.costing,'auto');assert.equal(payload.alternates,undefined);
assert(payload.locations.every(point=>point.radius===0),'request only the nearest eligible road; a broad radius creates megabytes of needless graph metadata');
const edge=(lat,lon,car=true)=>({correlated_lat:lat,correlated_lon:lon,edge:{access:{car}}});
const offroad=[{edges:[edge(41.89996,-87.826916),edge(41.9015149,-87.830546,false)]},{edges:[edge(41.84116,-87.665759)]}];
const result=endpointCheckResult(offroad,payload);
assert.equal(result.ready,false);assert.equal(result.points[0].within_limit,false);assert.equal(Math.round(result.points[0].nearest_road_distance_m),347);assert.equal(result.points[1].within_limit,true);assert.equal(result.route_requests,0);
assert.equal(endpointCheckResult([{edges:[]},{edges:[]}],payload).ready,false);
assert.throws(()=>endpointCheckResult({},payload));assert.throws(()=>endpointCheckPayload({origin:'bad',destination:params.destination}));
const readyData=payload.locations.map(point=>({edges:[edge(point.lat,point.lon)]}));
assert.equal(endpointCheckResult(readyData,payload).ready,true);
for(const [meters,expected]of [[99,true],[101,false]]){const shifted=payload.locations.map(point=>({edges:[edge(point.lat+meters/6371008.8*180/Math.PI,point.lon)]}));assert.equal(endpointCheckResult(shifted,payload).ready,expected,'100 m remains the hard limit');}

const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,dataset:{},setAttribute(){},addEventListener(){}});return nodes.get(id);};
const context={document:{getElementById:get,addEventListener(){}},console};context.window=context;vm.createContext(context);
vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),context);
get('origin').value=params.origin;get('destination').value=params.destination;
const state=vm.runInContext('state',context);let requests=0,roadChecks=0;
context.params=params;context.checkResult=result;
context.stubFetch=async path=>{assert.match(path,/check-endpoints$/);roadChecks++;return new Response(JSON.stringify(context.checkResult),{headers:{'Content-Type':'application/json'}});};
vm.runInContext("providerFetch=stubFetch;routeOptionsFromForm=()=>({});updateNextAction=()=>{};providerPreflight=async()=>{};validatedMaximumRouteMinutes=()=>120;cancelMapPick=()=>{};renderMapPickControls=()=>{};workflowPhase=()=>{};beginWorking=()=>()=>{};notice=()=>{};log=()=>{};providerCounts=()=>{}",context);
state.providerStatus={valhalla_ready:true,local_valhalla_ready:true};
const batch={status:'prepared_not_authorized_or_sent',requests:Array.from({length:49},(_,index)=>({index,request_kind:index?'gate_pair':'baseline',params,status:'prepared_not_authorized_or_sent'})),maximum_requests:49};
const draft={here:{params},shotgun:{batch},round:1};state.draft=draft;
await vm.runInContext('sendShotgun',context)(draft);
assert.equal(roadChecks,1);assert.equal(state.endpointCheck.status,'blocked');assert.equal(state.providerCalls.Valhalla,0);assert.equal(state.providerCalls.RentCast,0);assert.equal(batch.status,'prepared_not_authorized_or_sent');assert(batch.requests.every(r=>r.status==='prepared_not_authorized_or_sent'));
assert.match(get('here-result').textContent,/starting pin S/);assert.match(get('here-result').textContent,/347 metres/);
context.checkResult=endpointCheckResult(readyData,payload);
await vm.runInContext('checkTripEndpoints',context)();await vm.runInContext('checkTripEndpoints',context)();assert.equal(roadChecks,2,'successful matching checks are reused');
get('origin').value='41.902,-87.83';context.checkResult={...context.checkResult,points:[{...context.checkResult.points[0],original:[41.902,-87.83]},context.checkResult.points[1]]};
await vm.runInContext('checkTripEndpoints',context)();assert.equal(roadChecks,3,'moving a pin requires another check');
context.stubFetch=async()=>new Response('<html>sign in</html>',{headers:{'Content-Type':'text/html'}});vm.runInContext('providerFetch=stubFetch;verifiedEndpointKey=null',context);
await assert.rejects(vm.runInContext('checkTripEndpoints',context)(),/sign-in/);assert.equal(state.endpointCheck.status,'unavailable');assert.equal(state.providerCalls.Valhalla,0);
get('origin').value=params.origin;context.catalogCalls=0;context.stubFetch=async()=>new Response(JSON.stringify(result));vm.runInContext('providerFetch=stubFetch;suggestShotgunGates=()=>{catalogCalls++;};',context);
await assert.rejects(vm.runInContext('generateEscapeGateSets',context)(),/starting pin S/);assert.equal(context.catalogCalls,0,'bad pins stop before any Census gate search');

const actualFetch=globalThis.fetch,secret='a'.repeat(64);let claims=0,checks=0;
const env={VALHALLA_BASE_URL:'https://routing.example.com',VALHALLA_API_KEY:secret,DB:{prepare(){claims++;throw Error('Pin check must not claim a route');}}};
const request=origin=>new Request('https://rs.example.com/api/providers/valhalla/check-endpoints',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(params)});
globalThis.fetch=async(url,options)=>{checks++;assert.equal(new URL(url).pathname,'/locate');assert.equal(options.headers.Authorization,'Bearer '+secret);return new Response(JSON.stringify(offroad));};
try{assert.equal((await worker.fetch(request('https://other.example.com'),env)).status,403);assert.equal(checks,0);const response=await worker.fetch(request('https://rs.example.com'),env);assert.equal(response.status,200);assert.equal((await response.json()).ready,false);assert.equal(checks,1);assert.equal(claims,0);}finally{globalThis.fetch=actualFetch;}
console.log('Guided recovery passed: bad pin blocks all 49 routes, correct pin identification, successful check caching, changed-pin recheck, sign-in handling, authenticated road-only Worker check. Live route/AVM calls: 0.');
