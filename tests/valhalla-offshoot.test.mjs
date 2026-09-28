import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {valhallaPayload,valhallaEndpoint,validateValhallaResponse} from '../server/valhalla-provider.js';

const baseline={origin:'41.9,-87.6',destination:'42,-87.7',routingMode:'fast',departureTime:'any',alternatives:3};
const payload=valhallaPayload(baseline);
assert.equal(payload.locations.length,2);
assert.equal(payload.alternates,3);
assert.equal(payload.costing,'auto');
assert.equal(payload.shape_format,'polyline6');
const gated=valhallaPayload({...baseline,via:['41.91,-87.61;radius=200','41.99,-87.69;radius=200']});
assert.deepEqual(gated.locations.map(p=>p.type),['break','through','through','break']);
assert.equal(gated.locations[1].radius,200);
assert.equal(gated.alternates,0);
assert.equal(valhallaPayload({...baseline,routingMode:'short'}).costing_options.auto.shortest,true);
assert.throws(()=>valhallaPayload({...baseline,departureTime:'now'}));
assert.throws(()=>valhallaPayload({...baseline,'avoid[features]':'tollRoad'}));
assert.equal(valhallaEndpoint('https://routing.example.com').href,'https://routing.example.com/route');
assert.throws(()=>valhallaEndpoint('http://routing.example.com'));
assert.throws(()=>valhallaEndpoint('https://routing.example.com/other'));

function polyline6(points){let prior=[0,0],out='';for(const [lat,lon] of points){const next=[Math.round(lat*1e6),Math.round(lon*1e6)];for(let i=0;i<2;i++){let value=next[i]-prior[i];value=value<0?~(value<<1):value<<1;while(value>=32){out+=String.fromCharCode((32|(value&31))+63);value>>>=5;}out+=String.fromCharCode(value+63);}prior=next;}return out;}
const shape=polyline6([[41.9,-87.6],[41.91,-87.61]]);
const route={trip:{legs:[{shape,summary:{length:2.4,time:180}}]}};
validateValhallaResponse(route,1);
assert.throws(()=>validateValhallaResponse({...route,alternates:[route]},1));
const context={};vm.runInNewContext(await readFile(new URL('../dist/valhalla-decoder.js',import.meta.url),'utf8'),context);
const decoded=context.SurviveValhalla.convertRoutes(route,'round-1');
assert.equal(decoded.length,1);
assert.deepEqual(Array.from(decoded[0].geometry[0]),[-87.6,41.9]);
assert.equal(decoded[0].length_m,2400);
assert.equal(decoded[0].duration_s,180);
assert.equal(decoded[0].live_valhalla,true);
assert.equal(decoded[0].authority_ranges.length,0);
console.log('Valhalla payload, bounds, and route conversion passed.');
