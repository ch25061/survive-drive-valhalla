import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,'');
const context={window:{},document:{getElementById(){return{addEventListener(){}};}}};
vm.createContext(context);vm.runInContext(source,context);
const guard=context.window.SurviveDriveEndpointGuard;
assert.ok(guard,'endpoint guard is exposed for the desktop route workflow');
const requested={origin:'26.4619661,-81.8035874',destination:'26.2338608,-81.7892969'};
const bad={live_valhalla:true,geometry:[[-81.80356,26.461914],[-81.795648,26.253244]],route_directions:{source:'valhalla',steps:[]}};
const badCheck=guard.routeEndpointValidation(bad,requested);
assert.equal(badCheck.valid,false);
assert.equal(badCheck.side,'destination');
assert.match(badCheck.reason,/2\.25 km/);
bad.endpoint_validation=badCheck;
assert.equal(guard.routeChoiceAllowed(bad),false);
assert.throws(()=>guard.makeOsmAndTrack(bad),/cannot be exported/);
const good={...bad,geometry:[[-81.80356,26.461914],[-81.789297,26.233861]]};
good.endpoint_validation=guard.routeEndpointValidation(good,requested);
assert.equal(good.endpoint_validation.valid,true);
assert.equal(guard.routeChoiceAllowed(good),true);
assert.equal(guard.makeOsmAndTrack(good).geometry.length,2);
const polyline6=points=>{let prior=[0,0],out='';for(const [lat,lon] of points){const next=[Math.round(lat*1e6),Math.round(lon*1e6)];for(const value0 of next.map((value,index)=>value-prior[index])){let value=value0<0?~(value0<<1):value0<<1;while(value>=32){out+=String.fromCharCode((32|(value&31))+63);value>>>=5;}out+=String.fromCharCode(value+63);}prior=next;}return out;};
const decoderContext={};vm.runInNewContext(readFileSync('dist/valhalla-decoder.js','utf8'),decoderContext);
const decoded=decoderContext.SurviveValhalla.convertRoutes({trip:{locations:[{lat:26.4619661,lon:-81.8035874},{lat:26.2338608,lon:-81.7892969}],legs:[{shape:polyline6([[26.4619661,-81.8035874],[26.2338608,-81.7892969]]),summary:{length:10,time:60}}]}},'decoded-round',{expectedOrigin:requested.origin,expectedDestination:requested.destination})[0];
const decodedTrack=guard.makeOsmAndTrack(decoded);
assert.equal(JSON.stringify(decodedTrack.expected_endpoints),JSON.stringify({origin:[26.4619661,-81.8035874],destination:[26.2338608,-81.7892969]}),'decoder lon/lat evidence is normalized for app snapshots');

const actualPath='C:/Users/ch250/Downloads/survive-drive-session (8).json';
try{
  const session=JSON.parse(readFileSync(actualPath,'utf8'));
  const checks=session.candidates.routes.map(route=>guard.routeEndpointValidation(route,session.trip_setup));
  assert.equal(checks.length,43,'the captured failing session still contains all original candidates');
  assert.ok(checks.every(check=>check.valid===false),'every captured candidate is blocked by the 100 m endpoint guard');
  assert.ok(checks.every(check=>check.side==='destination'));
  console.log('Passed endpoint guard: synthetic bad/valid routes and the captured 43-route failing session are blocked from choice/navigation/export.');
}catch(error){
  if(error?.code==='ENOENT')console.log('Passed endpoint guard: synthetic bad/valid routes are blocked; captured-session check skipped because the download is unavailable.');
  else throw error;
}
