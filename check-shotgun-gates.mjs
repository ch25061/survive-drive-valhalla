import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const ui={};vm.createContext(ui);vm.runInContext(readFileSync('dist/shotgun-gates.js','utf8'),ui);const s=ui.SurviveShotgun;
const origin=[41.9,-87.7],at=(id,name,miles,bearing,rank=2,roads=4)=>{const d=miles/69,rad=bearing*Math.PI/180;return{id,name,latitude:origin[0]+d*Math.cos(rad),longitude:origin[1]+d*Math.sin(rad)/Math.cos(origin[0]*Math.PI/180),major_rank:rank,connected_roads:roads};};
const catalog={schema:'survive_drive_intersection_catalog_v1',version:'test-v1',source:'fixture',intersections:[at('n','North',2,0),at('ne','Northeast',2.4,45),at('e','East',2,90),at('se','Southeast',2,135),at('s','South',2,180),at('sw','Southwest',2,225),at('w','West',2,270),at('nw','Northwest',2,315),at('too-near','Near',.5,20),at('too-far','Far',5,200),at('e-secondary','East minor',2.2,88,5,2)]};
const starter=JSON.parse(readFileSync('dist/intersection-catalog-chicago-v1.json','utf8')),starterSuggestions=s.suggestGates(starter,[41.9683,-87.688],{inner_miles:1.5,outer_miles:3,maximum:8,sectors:8});assert.equal(starterSuggestions.gates.length,8);assert.ok(new Set(starterSuggestions.gates.map(g=>g.sector)).size>=6);
assert.throws(()=>s.validateCatalog({}),/versioned/);assert.throws(()=>s.validateCatalog({...catalog,intersections:[catalog.intersections[0],catalog.intersections[0]]}),/unique ID/);
const suggestions=s.suggestGates(catalog,origin,{inner_miles:1.5,outer_miles:3,maximum:8,sectors:8});assert.equal(suggestions.gates.length,8);assert.deepEqual(Array.from(suggestions.gates,g=>g.id).sort(),['e','n','ne','nw','s','se','sw','w']);assert.ok(suggestions.gates.every(g=>g.distance_m>=1.5*s.MILE_M&&g.distance_m<=3*s.MILE_M));assert.throws(()=>s.suggestGates(catalog,origin,{inner_miles:3,outer_miles:2}),/inner smaller/);
const crowded={...catalog,intersections:[at('n0','North 0',2,0),at('n10','North 10',2,10),at('n20','North 20',2,20),at('e','East',2,90),at('s','South',2,180),at('w','West',2,270)]};
const spaced=s.suggestGates(crowded,origin,{inner_miles:1.5,outer_miles:3,maximum:6,sectors:8,minimum_spacing_miles:0.75});assert.ok(spaced.gates.length<6);assert.equal(spaced.spacing_limited,true);assert.equal(spaced.rejection_counts.total,spaced.eligible_count-spaced.gates.length);assert.equal(spaced.rejection_counts.total,spaced.rejection_counts.spacing_only+spaced.rejection_counts.direction_only+spaced.rejection_counts.spacing_and_direction+spaced.rejection_counts.duplicate_corridor);for(let i=0;i<spaced.gates.length;i++)for(let j=i+1;j<spaced.gates.length;j++)assert.ok(s.distanceM([spaced.gates[i].latitude,spaced.gates[i].longitude],[spaced.gates[j].latitude,spaced.gates[j].longitude])>=0.75*s.MILE_M-1e-6);assert.throws(()=>s.suggestGates(catalog,origin,{inner_miles:1.5,outer_miles:2,minimum_spacing_miles:4.01}),/twice the outer radius/);
const bearingGap=(a,b)=>Math.min(Math.abs(a-b),360-Math.abs(a-b)),coastal={...catalog,version:'coastal-v1',intersections:[at('d1','Corridor 1',2.7,205),at('d2','Corridor 2',2.4,214),at('d3','Corridor 3',2.2,223),at('d4','Corridor 4',2,232),at('d5','Corridor 5',2.3,241),at('d6','Corridor 6',2.6,250),at('west','Distinct west approach',2.2,280)]};const coastalSuggestions=s.suggestGates(coastal,origin,{inner_miles:1.5,outer_miles:3,maximum:8,sectors:8,minimum_spacing_miles:.25});assert.ok(coastalSuggestions.gates.length<coastal.intersections.length,'a dense one-sided corridor must not create a visual gate clump');for(let i=0;i<coastalSuggestions.gates.length;i++)for(let j=i+1;j<coastalSuggestions.gates.length;j++){assert.ok(s.distanceM([coastalSuggestions.gates[i].latitude,coastalSuggestions.gates[i].longitude],[coastalSuggestions.gates[j].latitude,coastalSuggestions.gates[j].longitude])>=.25*s.MILE_M-1e-6);assert.ok(bearingGap(coastalSuggestions.gates[i].bearing_deg,coastalSuggestions.gates[j].bearing_deg)>=coastalSuggestions.minimum_bearing_gap_deg-1e-9);}
const boundaryDirections=[31,65,125,185,245,305],boundaryIntersections=boundaryDirections.flatMap((direction,cluster)=>Array.from({length:49},(_,index)=>at('b'+cluster+'-'+index,'Boundary-spread intersection '+cluster+'-'+index,3.01+.98*index/48,direction)));const boundary={...catalog,version:'boundary-spread-v1',intersections:boundaryIntersections},boundarySuggestions=s.suggestGates(boundary,origin,{inner_miles:3,outer_miles:4,maximum:6,sectors:6,minimum_spacing_miles:.25});assert.equal(boundarySuggestions.eligible_count,294);assert.equal(boundarySuggestions.gates.length,6,'the search must find six well-separated gates even when two valid bearings share a nominal sector');assert.ok(new Set(boundarySuggestions.gates.map(g=>g.sector)).size<boundarySuggestions.gates.length,'nominal sector boundaries must not veto a valid circular spread');for(let i=0;i<boundarySuggestions.gates.length;i++)for(let j=i+1;j<boundarySuggestions.gates.length;j++){assert.ok(s.distanceM([boundarySuggestions.gates[i].latitude,boundarySuggestions.gates[i].longitude],[boundarySuggestions.gates[j].latitude,boundarySuggestions.gates[j].longitude])>=.25*s.MILE_M-1e-6);assert.ok(bearingGap(boundarySuggestions.gates[i].bearing_deg,boundarySuggestions.gates[j].bearing_deg)>=boundarySuggestions.minimum_bearing_gap_deg-1e-9);}
const eastCluster={...catalog,version:'east-cluster-v1',intersections:[at('e1','East 1',2.2,73),at('e2','East 2',2.5,93),at('e3','East 3',2.8,116),at('sw','Southwest',2.4,230),at('nw1','Northwest 1',2.2,290),at('nw2','Northwest 2',2.8,330)]},eastSuggestions=s.suggestGates(eastCluster,origin,{inner_miles:2,outer_miles:3,maximum:6,sectors:6,minimum_spacing_miles:.5});assert.equal(eastSuggestions.gates.length,5,'three visually clustered east gates must not all be selected merely to fill the requested count');for(let i=0;i<eastSuggestions.gates.length;i++)for(let j=i+1;j<eastSuggestions.gates.length;j++)assert.ok(bearingGap(eastSuggestions.gates[i].bearing_deg,eastSuggestions.gates[j].bearing_deg)>=eastSuggestions.minimum_bearing_gap_deg-1e-9);
const sharedCorridor={...catalog,version:'shared-corridor-v1',intersections:[at('c1','Cicero Ave & State Rte 50',2.1,220),at('c2','State Rte 50 & Cicero Ave',2.3,250),at('c3','Cicero Ave & State Rte 50',2.6,280),at('d1','Distinct North Road',2.2,5),at('d2','Distinct East Road',2.4,80),at('d3','Distinct South Road',2.7,155)]},sharedCorridorSuggestions=s.suggestGates(sharedCorridor,origin,{inner_miles:2,outer_miles:3,maximum:6,sectors:6,minimum_spacing_miles:.25});assert.equal(sharedCorridorSuggestions.gates.length,6,'shared road names must not veto geographically valid gates');assert.equal(sharedCorridorSuggestions.gates.filter(g=>g.name.includes('Cicero Ave')).length,3);assert.equal(sharedCorridorSuggestions.rejection_counts.duplicate_corridor,0);assert.equal(sharedCorridorSuggestions.corridor_limited,false);
const sameRoad={...catalog,version:'same-road-v1',intersections:Array.from({length:8},(_,i)=>({...at('lsd'+i,'Lake Shore Dr · road gate',2.5,i*45),road_names:['Lake Shore Dr'],candidate_kind:'road_checkpoint'}))},sameRoadSuggestions=s.suggestGates(sameRoad,origin,{inner_miles:2,outer_miles:3,maximum:8,sectors:8,minimum_spacing_miles:.25});assert.equal(sameRoadSuggestions.gates.length,8,'road names are provenance, not a gate eligibility rule');assert.equal(sameRoadSuggestions.rejection_counts.duplicate_corridor,0);
const gpsColumn={...catalog,version:'gps-column-v1',intersections:[at('gc1','Column 1',2.2,210),at('gc2','Column 2',2.2,245),at('gc3','Column 3',2.2,280),at('gc4','Column 4',2.2,315)]},gpsColumnSuggestions=s.suggestGates(gpsColumn,origin,{inner_miles:2,outer_miles:3,maximum:4,sectors:6,minimum_spacing_miles:.25});assert.equal(gpsColumnSuggestions.gates.length,2,'a GPS-detected one-sided column must be returned as a limited set instead of a bad cluster');assert.equal(gpsColumnSuggestions.gps_cluster_limited,true);assert.ok(gpsColumnSuggestions.rejection_counts.gps_cluster>=2);assert.ok(gpsColumnSuggestions.gps_dispersion);
const gpsRecovery={...catalog,version:'gps-recovery-v1',intersections:[at('gr1','Preferred column 1',2.2,210,1),at('gr2','Preferred column 2',2.2,245,1),at('gr3','Preferred column 3',2.2,280,1),at('gr4','Preferred column 4',2.2,315,1),at('gr5','Alternate north',2.2,10,5),at('gr6','Alternate east',2.2,90,5),at('gr7','Alternate southeast',2.2,150,5)]},gpsRecoverySuggestions=s.suggestGates(gpsRecovery,origin,{inner_miles:2,outer_miles:3,maximum:6,sectors:6,minimum_spacing_miles:.25});assert.equal(gpsRecoverySuggestions.gates.length,6,'GPS optimization must substitute dispersed alternatives before limiting the gate count');assert.equal(gpsRecoverySuggestions.gps_cluster_limited,false);assert.ok(gpsRecoverySuggestions.gps_dispersion.largest_bearing_gap_deg<100);assert.ok(gpsRecoverySuggestions.gps_dispersion.linearity_ratio>.5);
let serial=0;
const draft={here:{maximum_candidates:3,params:{transportMode:'car',origin:'41.9,-87.7',destination:'42,-87.6',routingMode:'fast',departureTime:'any',alternatives:2}}};
const nextId=()=>`request-${++serial}`;
const start=suggestions.gates.slice(0,3).map((gate,index)=>({...gate,gate_number:index+1}));
const destination=suggestions.gates.slice(3,5).map((gate,index)=>({...gate,id:`destination-${index+1}`,gate_number:index+1}));
const batch=s.buildBatch(draft,start,destination,nextId);
assert.equal(batch.maximum_requests,12);
assert.equal(batch.maximum_candidates,14);
assert.equal(batch.baseline_candidates,3);
assert.deepEqual([batch.start_only_request_count,batch.destination_only_request_count,batch.both_gate_request_count],[3,2,6]);
assert.equal(batch.serial,true);
assert.equal(batch.retries,0);
assert.equal(batch.requests[0].request_kind,'baseline');
assert.equal(batch.requests[0].params.via,undefined);
assert.equal(batch.requests[0].params.alternatives,2);
const keys=batch.requests.map(request=>`${request.start_gate?.gate_number??0}:${request.destination_gate?.gate_number??0}`);
assert.equal(new Set(keys).size,12);
for(let a=0;a<=3;a++)for(let b=0;b<=2;b++)assert.ok(keys.includes(`${a}:${b}`));
for(const request of batch.requests.slice(1)){
  assert.equal(request.params.alternatives,0);
  assert.equal(request.maximum_candidates,1);
  assert.equal(request.params.via.length,Number(!!request.start_gate)+Number(!!request.destination_gate));
  assert.ok(request.params.via.every(value=>value.endsWith(';radius=800')));
}
const route=(id,offset=0,route_number=1)=>({id,route_number,geometry:[[-87.7+offset,41.9],[-87.6+offset,42]],cells:[]});
const same=s.deduplicateRoutes(batch.requests.map((request,index)=>({route:route(`same-${index}`),request_kind:request.request_kind,pair_number:request.pair_number,start_gate:request.start_gate,destination_gate:request.destination_gate})));
assert.equal(same.raw_count,12);
assert.equal(same.routes.length,1);
assert.equal(same.routes[0].shotgun_route_pairs.length,1);
const different=s.deduplicateRoutes([{route:route('a')},{route:route('b',.01)}]);
assert.equal(different.routes.length,2);
const simplePath=[[-80.25,25.75],[-80.15,25.85],[-80.15,26.05]];
const subdividedPath=[[-80.25,25.75],[-80.25,25.75],[-80.20,25.80],[-80.15,25.85],[-80.15,25.95],[-80.15,26.05]];
const repeatedPath=s.deduplicateRoutes([
  {route:{...route('plain'),geometry:simplePath},start_gate:start[0],destination_gate:destination[0],pair_number:1},
  {route:{...route('subdivided'),geometry:subdividedPath},start_gate:start[1],destination_gate:destination[1],pair_number:2}
]);
assert.equal(repeatedPath.routes.length,1,'gate-induced duplicate and straight-line vertices must not produce duplicate routes');
assert.equal(repeatedPath.duplicate_count,1);
assert.equal(repeatedPath.routes[0].shotgun_route_pairs.length,1,'merged paths keep one representative gate combination');
assert.equal(repeatedPath.routes[0].shotgun_gates.length,1);
assert.equal(repeatedPath.routes[0].shotgun_destination_gates.length,1);
assert.equal(repeatedPath.routes[0].shotgun_gates[0].id,start[0].id);
assert.equal(repeatedPath.routes[0].shotgun_destination_gates[0].id,destination[0].id);
assert.equal(repeatedPath.routes[0].shotgun_route_pairs[0].pair_number,1);
for(const geometry of [simplePath.slice().reverse(),[simplePath[0],[-80.20,25.81],...simplePath.slice(1)],[simplePath[0],simplePath[1],simplePath[0],...simplePath.slice(1)]]){
  assert.equal(s.deduplicateRoutes([{route:{...route('plain'),geometry:simplePath}},{route:{...route('distinct'),geometry}}]).routes.length,2,'reverse travel, different bends and backtracking must remain distinct');
}
const maxStart=Array.from({length:16},(_,i)=>({...start[i%start.length],id:`ms${i}`,gate_number:i+1}));
const maxDest=Array.from({length:16},(_,i)=>({...destination[i%destination.length],id:`md${i}`,gate_number:i+1}));
const ceiling=s.buildBatch({...draft,here:{...draft.here,maximum_candidates:4}},maxStart,maxDest,nextId);
assert.equal(ceiling.maximum_requests,289);
assert.equal(ceiling.maximum_candidates,292);
assert.equal(ceiling.gate_request_count,288);
assert.equal(ceiling.requests.filter(request=>request.start_gate&&!request.destination_gate).length,16);
assert.equal(ceiling.requests.filter(request=>!request.start_gate&&request.destination_gate).length,16);
assert.equal(ceiling.requests.filter(request=>request.start_gate&&request.destination_gate).length,256);
console.log('Passed Escape Gate selection, 289-request full start/destination cross-product, provenance, and deduplication. Actual provider calls: 0.');
