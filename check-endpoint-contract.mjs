// Permanent build gate: original requested endpoints are authoritative everywhere.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {valhallaPayload,validateValhallaResponse} from './server/valhalla-provider.js';
const decoder={};vm.runInNewContext(readFileSync('dist/valhalla-decoder.js','utf8'),decoder);
const app={window:{},document:{getElementById(){return{addEventListener(){}};}}};vm.createContext(app);vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),app);
const guard=app.window.SurviveDriveEndpointGuard;
const phone={TextEncoder};vm.runInNewContext(readFileSync('server/phone-handoff.js','utf8'),phone);
const packet=(points,expected)=>({gpx:'<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>'+points.map(([lat,lon])=>'<trkpt lat="'+lat+'" lon="'+lon+'"/>').join('')+'</trkseg></trk></gpx>',points:points.length,turns:0,route_name:'Offline endpoint proof',filename:'survive-drive-king-of-the-hill-proof.gpx',expected_endpoints:expected});
function encode(points){let prior=[0,0],out='';for(const p of points){const next=p.map(v=>Math.round(v*1e6));for(let n of next.map((v,i)=>v-prior[i])){n=n<0?~(n<<1):n<<1;while(n>=32){out+=String.fromCharCode((32|(n&31))+63);n>>>=5;}out+=String.fromCharCode(n+63);}prior=next;}return out;}
function response(points){return{trip:{locations:points.map(([lat,lon])=>({lat,lon})),legs:[{shape:encode(points),summary:{length:1,time:60}}]}};}
const requests=[];
for(let lat=-88;lat<=88;lat+=8)for(let lon=-176;lon<=176;lon+=16)requests.push({origin:[lat,lon],destination:[lat+.01,lon+.01]});
requests.push({origin:[0,179.9998],destination:[0,-179.9998]},{origin:[89.99,10],destination:[89.99,11]});
let checks=0;
for(const request of requests){
  const params={origin:request.origin.join(','),destination:request.destination.join(','),alternatives:0},valid=response([request.origin,request.destination]);
  const checked=validateValhallaResponse(valid,1,params);
  assert.equal(checked.route_validation.contract,'original-endpoints-geodesic-v1');
  assert.deepEqual(checked.route_validation.requested_endpoints,request);
  const converted=decoder.SurviveValhalla.convertRoutes(checked,'contract');assert.equal(converted.length,1);
  assert.equal(guard.routeChoiceAllowed(converted[0]),true);
  assert.equal(phone.validatePhoneHandoff(packet([request.origin,request.destination],request)).endpoint_contract,'original-endpoints-geodesic-v1');
  const nearby=response([request.origin,[request.destination[0]+.00085,request.destination[1]]]);
  assert.equal(validateValhallaResponse(nearby,1,params).route_validation.accepted_count,1,'95 m road snap remains usable');
  const distant=response([request.origin,[request.destination[0]+.001,request.destination[1]]]);
  assert.throws(()=>validateValhallaResponse(distant,1,params),/no route within 100 m/,'a truthful but wrong echoed endpoint cannot override the original request');
  assert.equal(decoder.SurviveValhalla.convertRoutes(distant,'bad',{expectedOrigin:params.origin,expectedDestination:params.destination}).length,0);
  assert.throws(()=>phone.validatePhoneHandoff(packet([request.origin,[request.destination[0]+.001,request.destination[1]]],request)),/does not reach/);
  const changed=JSON.parse(JSON.stringify(converted[0]));changed.geometry.at(-1)[1]+=.001;changed.endpoint_validation={valid:true,verified:true};
  assert.equal(guard.routeChoiceAllowed(changed),false,'saved validation cannot qualify changed path geometry');
  assert.throws(()=>guard.makeOsmAndTrack(changed),/cannot be exported/);
  const badStart=response([[request.origin[0]-.001,request.origin[1]],request.destination]);
  assert.throws(()=>validateValhallaResponse(badStart,1,params),/origin endpoint/);
  checks+=10;
}
const fixture=response([[41,-87],[42,-87]]),params={origin:'41,-87',destination:'42,-87',alternatives:0};
for(const original of [null,{}, {origin:',',destination:'42,-87'}, {origin:'41,-87',destination:'NaN,-87'}])assert.throws(()=>validateValhallaResponse(fixture,1,original),/missing original Start/);
assert.equal(decoder.SurviveValhalla.convertRoutes(fixture,'unbound').length,0,'echoed provider locations alone never prove requested endpoints');
const unbound={live_valhalla:true,geometry:[[-87,41],[-87,42]],endpoint_validation:{valid:true,verified:true},valhalla_evidence:{locations:fixture.trip.locations}};
assert.equal(guard.routeChoiceAllowed(unbound),false,'legacy candidate without original request evidence cannot be chosen');
assert.throws(()=>phone.validatePhoneHandoff(packet([[41,-87],[42,-87]],null)),/Original Start and Destination are missing/);
const accepted=validateValhallaResponse({...fixture,alternates:[response([[41,-87],[42.1,-87]])]},2,params);
assert.equal(accepted.route_validation.accepted_count,1);assert.equal(accepted.route_validation.rejected_count,1);
const missing=JSON.parse(JSON.stringify(decoder.SurviveValhalla.convertRoutes(accepted,'valid')[0]));missing.geometry=[];
assert.equal(guard.routeChoiceAllowed(missing),false);
const payload=valhallaPayload(params);assert.equal(payload.locations[0].search_cutoff,100);assert.equal(payload.locations.at(-1).search_cutoff,100);
assert.match(readFileSync('dist/app.js','utf8'),/expectedOrigin:request.params.origin,expectedDestination:request.params.destination/);
assert.match(readFileSync('local/planner.js','utf8'),/expectedOrigin:params.origin,expectedDestination:params.destination/);
assert.match(readFileSync('server/worker.js','utf8'),/validateValhallaResponse\([^\n]+,params\)/);
assert.match(readFileSync('local/bridge.mjs','utf8'),/validateValhallaResponse\([^\n]+,input.params\)/);
console.log('Permanent endpoint contract passed: '+requests.length+' locations, '+checks+' checks, both endpoints, poles/date line, original-request binding, legacy/mutated paths and mixed alternatives. Provider calls: 0.');

