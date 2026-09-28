import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ui={};vm.createContext(ui);vm.runInContext(readFileSync('dist/route-avm.js','utf8'),ui);const avm=ui.SurviveAvm;
const route=geometry=>({geometry,section_offsets:[{start_offset:0,end_offset:geometry.length-1}],here_evidence:{sections:[{spans:[{offset:0,streetAttributes:[]}]}]},cells:[]});
for(const [city,geometry]of [['Toronto',[[-79.42,43.66],[-79.4,43.65],[-79.38,43.64]]],['Los Angeles',[[-118.3,34.1],[-118.25,34.05]]],['Sydney',[[151.19,-33.86],[151.22,-33.88]]],['London',[[-.14,51.52],[-.1,51.49]]],['Dateline',[[179.98,10],[-179.98,10.01]]],['Polar',[[30,89.98],[31,89.97]]]]){
  const input=route(geometry),grid=avm.gridForRoute(input),honey=avm.enclosingHoneycomb(input),mapped=avm.mapRoute(input);assert.match(grid.grid_version,/REG1K-V1/);assert.equal(mapped.avm_mapping,honey.grid_version);assert.ok(mapped.cells.length>0,city);assert.ok(honey.cells.length>mapped.cells.length,city);
  const reversed=route(geometry.slice().reverse());assert.equal(avm.gridForRoute(reversed).grid_version,grid.grid_version,city);
  for(const point of geometry){const roundTrip=grid.inverse(...grid.forward(...point));const longitudeError=Math.abs(((roundTrip[0]-point[0]+180)%360+360)%360-180);assert.ok(longitudeError<1e-6&&Math.abs(roundTrip[1]-point[1])<1e-6,city);}
  input.cells=mapped.cells;const positions=avm.routeCellPositions(input);assert.ok(positions.total_non_highway_distance_m>0);assert.ok(mapped.cells.every(c=>positions.intervals.has(c.cell_id)));
  assert.ok(honey.cells.every(c=>Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180));
}
const dateline=avm.gridForRoute(route([[179.98,10],[-179.98,10.01]]));assert.equal(dateline.grid_anchor.longitude,-180);
const chi=avm.gridForRoute(route([[-87.7,41.9],[-87.68,41.91]]));assert.equal(chi.grid_version,'CHI1K-V1');assert.notEqual(avm.enclosingHoneycomb(route([[-79,44],[-78.99,44.01]])).cells[0].cell_id,avm.enclosingHoneycomb(route([[-87.7,41.9],[-87.68,41.91]])).cells[0].cell_id);
assert.throws(()=>avm.gridForRoute(route([[0,0],[180,0]])),/too large/);assert.throws(()=>avm.gridForRoute(route([[0,91],[0,90]])),/valid/);
console.log('Passed regional grids: deterministic recipes, international compact routes, dateline and polar projection, reversible coordinates, enclosure/mapping/sampling namespace agreement, Chicago preservation and oversized-route rejection. Provider calls: 0.');
