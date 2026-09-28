import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context={};
vm.createContext(context);
vm.runInContext(readFileSync('dist/pool-screening.js','utf8'),context);
const sampler=context.SurvivePool.routeQuotaPlan;
assert.equal(context.SurvivePool.routeQuotaAlgorithm,'known_anchor_route_gap_quota_v3','the public sampler version identifies the evidence-gap policy');
const cell=(index,{id,exposure=100,value=null}={})=>({cell_id:id??`CHI1K-V1-Q+${index}-R+0`,latitude:41.9+index/1000,longitude:-87.6,outside_here_distance_m:exposure,estimate_ppsqft:value});
const route=(id,cells)=>({id,name:`Route ${id}`,cells});
const positionsFor=(routeData,positions)=>({[routeData.id]:routeData.cells.map((entry,index)=>[entry.cell_id,positions[index]])});
const indexOf=entry=>Number(entry.cell_id.match(/Q\+(\d+)/)[1]);

// Without known values, quota 5 seeds the eligible unknown span endpoints,
// then repeatedly chooses the unknown farthest from the selected anchors.
const fivePositions=[0,0.1,0.3,0.5,0.7,0.9,1],fiveRoute=route('five',fivePositions.map((_,i)=>cell(i)));
const five=sampler([fiveRoute],5,['five'],{route_positions:positionsFor(fiveRoute,fivePositions)});
assert.equal(five.selected_count,5);
const fiveSelected=five.selected_cells.map(entry=>fivePositions[indexOf(entry)]);
assert.ok(fiveSelected.some(position=>position<=0.1),'no-known quota 5 spans the Start section');
assert.ok(fiveSelected.some(position=>position>=0.45&&position<=0.55),'no-known quota 5 spans the middle section');
assert.ok(fiveSelected.some(position=>position>=0.9),'no-known quota 5 spans the destination section');
assert.deepEqual(Array.from(five.selected_cells,entry=>entry.cell_id),Array.from(sampler([fiveRoute],5,['five'],{route_positions:positionsFor(fiveRoute,fivePositions)}).selected_cells,entry=>entry.cell_id),'same route, positions, and quota produce the same deterministic order');
assert.equal(five.provider_calls,0,'planning itself makes no provider calls');

// A dense known center creates short center gaps. The two largest distances
// are the uncovered Start and destination sections, so those unknowns win.
const denseKnownPositions=Array.from({length:9},(_,i)=>0.4+i*0.02),densePositions=[0.02,0.1,0.43,0.51,0.97,...denseKnownPositions].sort((a,b)=>a-b),denseKnown=new Set(denseKnownPositions),denseRoute=route('dense',densePositions.map((_,i)=>cell(i,{value:denseKnown.has(densePositions[i])?300:null})));
const dense=sampler([denseRoute],2,['dense'],{route_positions:positionsFor(denseRoute,densePositions)});
const denseSelected=dense.selected_cells.map(entry=>densePositions[indexOf(entry)]);
assert.ok(denseSelected.includes(0.02),'uncovered Start gap is selected');
assert.ok(denseSelected.includes(0.97),'uncovered destination gap is selected');
assert.ok(!denseSelected.includes(0.43)&&!denseSelected.includes(0.51),'unknown cells in the known-dense center are avoided');

// A represented Start plus an uncovered destination makes the destination
// candidate the farthest from actual known evidence; no endpoint is forced.
const startKnown=new Set([0.02,0.05,0.08]),endpointPositions=[0.02,0.03,0.05,0.08,0.4,0.5,0.6,0.98],endpointRoute=route('start-known',endpointPositions.map((_,i)=>cell(i,{value:startKnown.has(endpointPositions[i])?300:null})));
const endpoint=sampler([endpointRoute],1,['start-known'],{route_positions:positionsFor(endpointRoute,endpointPositions)});
assert.equal(endpointPositions[indexOf(endpoint.selected_cells[0])],0.98,'known Start anchors do not force another Start lookup when the destination is less represented');

// A canonical shared cell is one call and is credited to every eligible member.
const shared=cell(100,{id:'CHI1K-V1-Q+100-R+0'});
const sharedOnly=sampler([route('a',[shared]),route('b',[{...shared}])],1,['a','b']);
assert.equal(sharedOnly.selected_count,1,'shared canonical cell is deduplicated into a single lookup');
assert.deepEqual(Array.from(sharedOnly.selected_cells[0].unknown_member_route_ids),['a','b']);
assert.deepEqual(Array.from(sharedOnly.route_sampling,row=>row.selected_cells),[1,1],'shared evidence fills both route quotas');
assert.deepEqual(Array.from(sharedOnly.selected_cells[0].members,member=>member.route_id).sort(),['a','b']);

// A shared cell selected for one enabled route is incidental on another enabled
// route unless that second route independently selects it for its quota.
const otherCell=cell(101),otherStart=cell(102);
const independentShared=sampler([route('origin',[shared]),route('other',[{...shared},otherCell,otherStart])],1,['origin','other'],{route_positions:{origin:[[shared.cell_id,0]],other:[[shared.cell_id,1],[otherCell.cell_id,.5],[otherStart.cell_id,0]]}});
assert.deepEqual(Array.from(independentShared.selected_cells.find(entry=>entry.cell_id===shared.cell_id).selected_for_route_ids),['origin']);
assert.equal(independentShared.route_sampling.find(row=>row.route_id==='other').selected_cells,1,'the other route still receives its own quota cell');
assert.equal(independentShared.route_sampling.find(row=>row.route_id==='other').incidental_shared_cells,1,'the shared value is disclosed without replacing the other route quota');

// Disabled routes stay in ranking data and receive separately disclosed
// incidental shared evidence without counting toward enabled quota routes.
const excludedShared=sampler([route('enabled',[shared]),route('disabled',[{...shared}])],1,['enabled']);
assert.equal(excludedShared.route_sampling.find(row=>row.route_id==='disabled').enabled,false);
assert.equal(excludedShared.route_sampling.find(row=>row.route_id==='disabled').selected_cells,0);
assert.equal(excludedShared.route_sampling.find(row=>row.route_id==='disabled').incidental_shared_cells,1);
assert.equal(excludedShared.selected_cells[0].members.length,2,'the exact lookup retains all route memberships');

// Short availability discloses the shortfall and keeps known, highway-only,
// and previously attempted cells out of the paid selection.
const limited=sampler([route('short',[cell(1),cell(2,{exposure:.5}),cell(3,{value:400}),cell(4)])],3,['short'],{excluded_cell_ids:['CHI1K-V1-Q+4-R+0']});
assert.equal(limited.selected_count,1);
assert.equal(limited.route_sampling[0].available_unique_cells,1);
assert.equal(limited.route_sampling[0].shortfall,2);
assert.equal(limited.route_sampling[0].selection_status,'fewer eligible cells than requested');
assert.equal(limited.selected_cells[0].cell_id,'CHI1K-V1-Q+1-R+0');

// Cross-route deduplication keeps actual calls below 100 even when N times
// enabled routes can exceed 100 total cells while each route has its own quota.
const commonTen=Array.from({length:10},(_,i)=>cell(i,{id:`CHI1K-V1-Q+${i}-R+0`}));
const twelveShared=Array.from({length:12},(_,i)=>route(`r${String(i).padStart(2,'0')}`,commonTen.map(item=>({...item}))));
const deduped=sampler(twelveShared,10,twelveShared.map(item=>item.id));
assert.equal(deduped.selected_count,10);
assert.ok(deduped.enabled_route_count*10>100);
assert.ok(deduped.selected_count<=100);
const manyRoutes=Array.from({length:11},(_,r)=>route(`unique-${r}`,Array.from({length:10},(_,i)=>cell(r*10+i))));
const largePlan=sampler(manyRoutes,10,manyRoutes.map(item=>item.id));
assert.equal(largePlan.selected_count,110,'the first paid round retains ten cells per route across more than 100 unique cells');
assert.ok(largePlan.route_sampling.every(row=>row.selected_cells===10),'each route receives its own quota');

// Cache-only zero-quota operation remains valid with every route disabled.
const cacheOnly=sampler([route('off',[cell(1)])],0,[]);
assert.equal(cacheOnly.selected_count,0);
assert.equal(cacheOnly.enabled_route_count,0);
assert.equal(cacheOnly.provider_calls,0);

console.log('Passed deterministic route-distance maximin selection, known-anchor avoidance, uncovered endpoint behavior, shared-cell deduplication/credit, disabled-route disclosure, per-route quota above 100 total cells, and zero-provider-call tests.');
