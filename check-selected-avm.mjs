import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={};vm.createContext(context);vm.runInContext(readFileSync('dist/route-avm.js','utf8'),context);
const avm=context.SurviveAvm,reference=JSON.parse(readFileSync('dist/reference.json','utf8')).routes[0],evidence=JSON.parse(readFileSync('fixtures/route5-authority.json','utf8'));
const route={geometry:reference.geometry,here_evidence:evidence,section_offsets:[{start_offset:0,end_offset:reference.geometry.length-1}]};
const mapped=avm.mapRoute(route);assert.equal(mapped.cells.length,12);assert.deepEqual(Array.from(mapped.authority_offsets),[166,427]);assert.equal(mapped.authority_only_cell_count,reference.authority_only_cell_count);
for(const cell of mapped.cells){const original=reference.cells.find(c=>c.cell_id===cell.cell_id);assert.ok(original);assert.ok(Math.abs(cell.outside_here_distance_m-original.outside_here_distance_m)<.001);assert.equal(cell.latitude,original.latitude);assert.equal(cell.longitude,original.longitude);assert.equal(cell.estimate_ppsqft,null);assert.equal(cell.polygon.length,7);}
assert.throws(()=>avm.mapRoute({geometry:route.geometry}),/spans/);
const bad=structuredClone(route);delete bad.here_evidence.sections[0].spans[0].streetAttributes;assert.throws(()=>avm.mapRoute(bad),/incomplete/);
const [lon,lat]=avm.inverse(...avm.center(0,0));assert.equal(lat,41.91063814);assert.equal(lon,-87.66769738);
// Section-local offsets: adjacent sections share their joined geometry vertex.
const points=[avm.inverse(-300,0),avm.inverse(0,0),avm.inverse(300,0)];
const multi={geometry:points,section_offsets:[{start_offset:0,end_offset:1},{start_offset:1,end_offset:2}],here_evidence:{sections:[{spans:[{offset:0,streetAttributes:[]}]},{spans:[{offset:0,streetAttributes:['controlledAccessHighway']}]}]}};
const mixed=avm.mapRoute(multi);assert.deepEqual(Array.from(mixed.authority_offsets),[1,2]);assert.equal(mixed.cells.length,1);assert.ok(Math.abs(mixed.cells[0].outside_here_distance_m-300)<.001);assert.ok(Math.abs(mixed.cells[0].here_distance_m-300)<.001);
const noRamps=structuredClone(multi);noRamps.here_evidence.sections[1].spans[0].streetAttributes=['motorway'];assert.equal(avm.mapRoute(noRamps).authority_ranges.length,0);
const allHighway=structuredClone(multi);allHighway.here_evidence.sections[0].spans[0].streetAttributes=['controlledAccessHighway'];assert.equal(avm.mapRoute(allHighway).cells.length,0);
const gap=structuredClone(multi);gap.section_offsets[1].start_offset=2;assert.throws(()=>avm.mapRoute(gap));
// Separate controlled-access runs retain their attached ramps, while the surface-street segment between them stays eligible for OURS.
const twoRuns={geometry:Array.from({length:9},(_,i)=>Array.from(avm.inverse(-400+i*100,0))),cells:[],section_offsets:[{start_offset:0,end_offset:8}],here_evidence:{sections:[{spans:[
  {offset:0,streetAttributes:['ramp']},
  {offset:1,streetAttributes:['controlledAccessHighway']},
  {offset:3,streetAttributes:['ramp']},
  {offset:4,streetAttributes:[]},
  {offset:5,streetAttributes:['ramp']},
  {offset:6,streetAttributes:['controlledAccessHighway']},
  {offset:7,streetAttributes:['ramp']},
]}]}};
const twoRunsMapped=avm.mapRoute(twoRuns);
assert.deepEqual(JSON.parse(JSON.stringify(twoRunsMapped.authority_ranges)),[[0,4],[5,8]]);
assert.equal(twoRunsMapped.authority_offsets,null);
assert.ok(Math.abs(avm.routeCellPositions({...twoRuns,...twoRunsMapped}).total_non_highway_distance_m-100)<.01);
const berlin=avm.mapRoute({...multi,geometry:[[13,52],[13.1,52.1],[13.2,52.2]]});assert.match(berlin.avm_mapping,/^REG1K-V1/);assert.ok(berlin.cells.length>0);
console.log('Passed selected-route geometry: authentic Route 5 cells/distances/exact cache coordinates, authority offsets, multi-section offsets, mixed authority cell, separate controlled-access runs with a surface-street gap, highway-only exclusion, missing evidence/gap/region rejection. Provider calls: 0.');
