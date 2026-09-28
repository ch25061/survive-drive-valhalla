import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context={};
vm.createContext(context);
vm.runInContext(readFileSync('dist/pool-screening.js','utf8'),context);
const cell=(q,r,distance,value)=>({cell_id:`CHI1K-V1-Q${q>=0?'+':''}${q}-R${r>=0?'+':''}${r}`,latitude:41.91+r*.004,longitude:-87.67+q*.006,outside_here_distance_m:distance,estimate_ppsqft:value});
const red=cell(0,0,100,200),green=cell(3,0,100,300),adjacent=cell(1,0,100,null),far=cell(8,0,400,null),stableRed=cell(-4,0,150,180),stableGreen=cell(-3,0,850,400);
const routes=[
  {id:'promising',name:'Promising',cells:[red,green,adjacent,far]},
  {id:'known',name:'Known',cells:[cell(20,0,300,200),cell(21,0,700,400)]},
  {id:'stable',name:'Stable',cells:[stableRed,stableGreen]}
];
const results={ranked_routes:[{route_id:'promising',rank:2},{route_id:'known',rank:1},{route_id:'stable',rank:3}],attempted_cell_ids:[],red_threshold_ppsqft:250};
const tiedRoutes=[{id:'slow-tie',name:'A slow route',duration_s:1200,cells:[cell(30,0,100,200),cell(31,0,100,300)]},{id:'fast-tie',name:'Z fast route',duration_s:600,cells:[cell(32,0,100,200),cell(33,0,100,300)]}];
const tiedEvolution=context.SurvivePool.evolve(tiedRoutes,{ranked_routes:[],attempted_cell_ids:[],red_threshold_ppsqft:250},0,'time-tie',1);
assert.equal(tiedEvolution.rank_intervals.find(row=>row.route_id==='fast-tie').current_rank,1,'ranking evolution breaks equal Red shares by shorter travel time');
const first=context.SurvivePool.evolve(routes,results,1,'evolution-seed',1);
const repeat=context.SurvivePool.evolve(routes,results,1,'evolution-seed',1);
assert.equal(first.algorithm,'rank_interval_red_frontier_v1');
assert.equal(first.generation,1);
assert.equal(first.maximum_attempts,1);
assert.equal(first.provider_calls,0);
assert.equal(first.selected_cells.length,1);
assert.equal(first.selected_cells[0].cell_id,adjacent.cell_id,'a missing cell adjoining a known Red cell gets the red-extension priority');
assert.equal(first.selected_cells[0].nearest_known_red_hops,1);
assert.equal(first.selected_cells[0].members[0].contender,true);
assert.equal(JSON.stringify(first.selected_cells.map(x=>x.cell_id)),JSON.stringify(repeat.selected_cells.map(x=>x.cell_id)),'generation plan is reproducible from the seed');
assert.equal(first.route_sampling.find(x=>x.route_id==='promising').rank_interval.best,1);
assert.ok(first.route_sampling.find(x=>x.route_id==='promising').rank_interval.worst>1,'uncertain route carries a rank interval');
assert.equal(first.ranking_stable,false);

const shared=cell(10,10,80,null),sharedRoutes=[
  {id:'share-a',name:'Share A',cells:[cell(9,10,100,180),shared]},
  {id:'share-b',name:'Share B',cells:[cell(11,10,100,190),structuredClone(shared)]}
];
const sharedPlan=context.SurvivePool.evolve(sharedRoutes,{ranked_routes:[],attempted_cell_ids:[],red_threshold_ppsqft:250},4,'shared-evolution',2);
assert.equal(sharedPlan.selected_cells.length,1,'a shared canonical cell is requested once');
assert.deepEqual(Array.from(sharedPlan.selected_cells[0].shared_route_ids),['share-a','share-b']);
assert.equal(sharedPlan.selected_cells[0].members.length,2,'the same evidence is credited to each traversing route');
assert.equal(sharedPlan.selected_cells[0].generation,2);

const attempted=context.SurvivePool.evolve([
  {id:'attempted',name:'Attempted',cells:[cell(0,0,100,200),cell(1,0,200,null)]},
  {id:'comparison',name:'Comparison',cells:[cell(5,0,100,200),cell(6,0,100,300)]}
],{ranked_routes:[],attempted_cell_ids:[cell(1,0,200,null).cell_id],red_threshold_ppsqft:250},5,'attempted-seed',3);
assert.equal(attempted.selected_cells.length,0,'previously attempted failed or uncertain cells cannot be automatically retried');
assert.equal(attempted.previously_attempted_cells,1);
assert.equal(attempted.provider_calls,0);
assert.equal(attempted.stopping_reason,'no_exact_unattempted_missing_cells');

const complete=context.SurvivePool.evolve([{id:'complete',name:'Complete',cells:[stableRed,stableGreen]}],{ranked_routes:[],attempted_cell_ids:[],red_threshold_ppsqft:250},5,'complete-seed',4);
assert.equal(complete.ranking_stable,true);
assert.equal(complete.stopping_reason,'ranking_stable');
assert.equal(complete.selected_cells.length,0);

assert.throws(()=>context.SurvivePool.evolve(routes,{ranked_routes:[],attempted_cell_ids:[],red_threshold_ppsqft:250},101,'seed',1),/ceiling/);
assert.throws(()=>context.SurvivePool.evolve(routes,{ranked_routes:[],attempted_cell_ids:[],red_threshold_ppsqft:250},1,'seed',0),/generation/);
assert.throws(()=>context.SurvivePool.evolve([{id:'a',cells:[shared]},{id:'b',cells:[{...shared,latitude:42}]}],{ranked_routes:[],attempted_cell_ids:[],red_threshold_ppsqft:250},1,'seed',1),/conflicting/);

const pruned=context.SurvivePool.pruneLowestRankedRoutes([
  {route_id:'top',rank:1},{route_id:'middle',rank:2},{route_id:'low',rank:3},{route_id:'manual-off',rank:4}
],['top','middle','low'],0.25);
assert.deepEqual(Array.from(pruned.enabled_route_ids),['top','middle'],'the lowest-ranked enabled route is removed while the manually excluded route stays excluded');
assert.deepEqual(Array.from(pruned.disabled_route_ids),['low']);
assert.deepEqual(Array.from(pruned.considered_route_ids),['low','middle','top'],'ranking determines the cull regardless of input order');
assert.deepEqual(Array.from(context.SurvivePool.pruneLowestRankedRoutes([{route_id:'only',rank:1}],['only']).enabled_route_ids),['only'],'at least one enabled route survives');
assert.deepEqual(Array.from(context.SurvivePool.pruneLowestRankedRoutes([{route_id:'a',rank:1},{route_id:'b',rank:2}],['a','b']).disabled_route_ids),['b'],'small pools still make progress without removing every route');
assert.deepEqual(Array.from(context.SurvivePool.pruneLowestRankedRoutes(Array.from({length:7},(_,i)=>({route_id:'r'+i,rank:i+1})),Array.from({length:7},(_,i)=>'r'+i)).disabled_route_ids).length,3,'ceil(40%) pruning maps seven enabled routes to four survivors');
assert.throws(()=>context.SurvivePool.pruneLowestRankedRoutes([],['a'],1),/fraction/);

console.log('Automatic ranking evolution selector checks passed.');
