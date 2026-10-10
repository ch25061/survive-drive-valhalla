// Geographic coverage regression for the permanent global mesh, replacing regional anchors.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ui={};vm.createContext(ui);vm.runInContext(readFileSync('dist/h3-pinned.js','utf8'),ui);vm.runInContext(readFileSync('dist/route-avm.js','utf8'),ui);const avm=ui.SurviveAvm;
const route=geometry=>({geometry,section_offsets:[{start_offset:0,end_offset:geometry.length-1}],here_evidence:{sections:[{spans:[{offset:0,streetAttributes:[]}]}]},cells:[]});
for(const [city,geometry] of [['Toronto',[[-79.42,43.66],[-79.4,43.65],[-79.38,43.64]]],['Los Angeles',[[-118.3,34.1],[-118.25,34.05]]],['Sydney',[[151.19,-33.86],[151.22,-33.88]]],['London',[[-.14,51.52],[-.1,51.49]]],['Polar',[[30,89.98],[31,89.97]]],['Dateline',[[179.98,10],[-179.98,10.01]]]]){
 const input=route(geometry),grid=avm.gridForRoute(input),honey=avm.enclosingHoneycomb(input),mapped=avm.mapRoute(input);assert.equal(grid.grid_version,'H3R8-V1');assert.equal(mapped.avm_mapping,honey.grid_version);assert.ok(mapped.cells.length>0,city);assert.ok(honey.cells.length>mapped.cells.length,city);
 const reversed=route(geometry.slice().reverse());assert.deepEqual([...avm.mapRoute(reversed).cells].map(c=>c.cell_id).sort(),[...mapped.cells].map(c=>c.cell_id).sort());
 input.cells=mapped.cells;const positions=avm.routeCellPositions(input);assert.ok(positions.total_non_highway_distance_m>0);assert.ok(mapped.cells.every(c=>positions.intervals.has(c.cell_id)));assert.ok(honey.cells.every(c=>Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180));
}
assert.equal(avm.gridForRoute(route([[-87.51,41.9],[-87.49,41.9]])).grid_version,'H3R8-V1');assert.throws(()=>avm.gridForRoute(route([[0,91],[0,90]])),/valid/);
console.log('Passed global geographic coverage: international, polar, dateline, former regional borders, route reversal and shared enclosure/mapping identities. Provider calls: 0.');
