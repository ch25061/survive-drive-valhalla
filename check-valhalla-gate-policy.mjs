import assert from 'node:assert/strict';
import {valhallaPayload} from './server/valhalla-provider.js';
import worker from './dist/server/index.js';

const params={transportMode:'car',origin:'25.72,-80.29',destination:'26.12,-80.19',routingMode:'fast',departureTime:'any',alternatives:0,return:'polyline,summary,turnByTurnActions,routeLabels',spans:'streetAttributes,names,routeNumbers,functionalClass',via:['25.8,-80.28;radius=800','26.08,-80.18;radius=800']};
const ring=[[-80.4,26],[-80.39,26],[-80.39,26.01],[-80.4,26.01],[-80.4,26]];
const payload=valhallaPayload({...params,exclude_polygons:[ring]});
assert.deepEqual(payload.locations.map(p=>p.type),['break','via','via','break']);
assert.ok(payload.locations.slice(1,-1).every(p=>p.radius===800&&p.rank_candidates===false));
assert.ok([payload.locations[0],payload.locations.at(-1)].every(p=>!Object.hasOwn(p,'rank_candidates')&&!Object.hasOwn(p,'radius')));
assert.deepEqual(payload.exclude_polygons,[ring]);
assert.equal(valhallaPayload({...params,via:['25.8,-80.28']}).locations[1].rank_candidates,false);
assert.throws(()=>valhallaPayload({...params,via:['25.8,-80.28;radius=1600']}),/Unsupported Route Gate radius/,'engine cap does not silently widen the gate request');

const originalFetch=globalThis.fetch;
let mockCalls=0,claimedPayload;
const db={prepare(){return{bind(...args){claimedPayload=JSON.parse(args[2]);return this;},async first(){return{round_id:'offline-gate-policy'};}};}};
globalThis.fetch=async(url,options)=>{
  mockCalls++;
  assert.equal(String(url),'https://routing.example/route');
  assert.equal(options.method,'POST');
  const sent=JSON.parse(options.body);
  assert.deepEqual(sent,claimedPayload);
  assert.deepEqual(sent.locations.map(p=>p.type),['break','via','via','break']);
  assert.ok(sent.locations.slice(1,-1).every(p=>p.radius===800&&p.rank_candidates===false));
  assert.deepEqual(sent.exclude_polygons,[ring]);
  return Response.json({trip:{legs:[{shape:"_ky`p@~kocxC_glW_ibE",summary:{length:1,time:60}}]}});
};
try{
  const origin='https://test.example';
  const response=await worker.fetch(new Request(origin+'/api/providers/valhalla',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({approved:true,round_id:'offline-gate-policy',params:{...params,exclude_polygons:[ring]}})}),{DB:db,VALHALLA_BASE_URL:'https://routing.example',VALHALLA_API_KEY:'0'.repeat(64)});
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(mockCalls,1);
}finally{globalThis.fetch=originalFetch;}
console.log('Passed source and built Worker gate semantics, endpoint snapping and exclusion forwarding. Live provider calls: 0.');
