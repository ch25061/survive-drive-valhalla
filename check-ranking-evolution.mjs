import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context={};
vm.createContext(context);
vm.runInContext(readFileSync('dist/pool-screening.js','utf8'),context);
const cell=(q,r,distance,value)=>({cell_id:`CHI1K-V1-Q${q>=0?'+':''}${q}-R${r>=0?'+':''}${r}`,latitude:41.91+r*.004,longitude:-87.67+q*.006,outside_here_distance_m:distance,estimate_ppsqft:value});
const red=cell(0,0,100,200),green=cell(3,0,100,300),adjacent=cell(1,0,100,null),far=cell(8,0,400,null),stableRed=cell(-4,0,150,180),stableGreen=cell(-3,0,850,400);
const routes=[
  {id:'promising',name:'Promising',duration_s:600,cells:[red,green,adjacent,far]},
  {id:'known',name:'Known',duration_s:600,cells:[cell(20,0,300,200),cell(21,0,700,400)]},
  {id:'stable',name:'Stable',duration_s:600,cells:[stableRed,stableGreen]}
];
const results={ranked_routes:[{route_id:'promising',rank:2},{route_id:'known',rank:1},{route_id:'stable',rank:3}],attempted_cell_ids:[],red_threshold_ppsqft:250};
const tiedRoutes=[{id:'slow-tie',name:'A slow route',duration_s:1200,cells:[cell(30,0,100,200),cell(31,0,100,500)]},{id:'fast-tie',name:'Z fast route',duration_s:600,cells:[cell(32,0,100,200),cell(33,0,100,300)]}];
const tiedEvolution=context.SurvivePool.evolve(tiedRoutes,{ranked_routes:[],attempted_cell_ids:[],red_threshold_ppsqft:250},0,'time-tie',1);
assert.equal(tiedEvolution.rank_intervals.find(row=>row.route_id==='fast-tie').current_rank,1,'ranking evolution breaks equal absolute Red miles by shorter returned travel time');
assert.equal(tiedEvolution.algorithm,'weighted_orange_time_frontier_v3');
const first=context.SurvivePool.evolve(routes,results,1,'evolution-seed',1);
const repeat=context.SurvivePool.evolve(routes,results,1,'evolution-seed',1);
assert.equal(first.algorithm,'weighted_orange_time_frontier_v3');
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
assert.equal(first.route_sampling.find(x=>x.route_id==='promising').red_distance_bounds_m.lower,100,'partial evidence reports its absolute known-Red lower bound');
assert.equal(first.route_sampling.find(x=>x.route_id==='promising').red_distance_bounds_m.upper,600,'partial evidence reports its conservative possible-Red upper bound');
assert.equal(first.ranking_stable,false);

const noEvidence=context.SurvivePool.evolve([{id:'unknown-only',name:'Unknown only',duration_s:100,cells:[cell(40,0,500,null)]}],{ranked_routes:[{route_id:'unknown-only',rank:1}],attempted_cell_ids:[],red_threshold_ppsqft:250},0,'unranked',5);
assert.equal(noEvidence.rank_intervals[0].current_rank,null,'a stale supplied rank never ranks a route with no known evidence');
assert.equal(noEvidence.rank_intervals[0].red_distance_bounds_m.lower,0,'unknown-only evidence has zero known Red lower bound');
assert.equal(noEvidence.rank_intervals[0].red_distance_bounds_m.upper,500,'unknown-only evidence remains an absolute possible-Red interval');
assert.equal(noEvidence.rank_intervals[0].contender,true,'an unranked route can still be selected for evidence');
const unknownOnlySample=context.SurvivePool.evolve([{id:'unknown-only',name:'Unknown only',duration_s:100,cells:[cell(40,0,500,null)]}],{ranked_routes:[{route_id:'unknown-only',rank:1}],attempted_cell_ids:[],red_threshold_ppsqft:250},1,'unranked-sample',5);
assert.equal(unknownOnlySample.rank_intervals[0].current_rank,null,'sampling does not fabricate a route rank');
assert.equal(unknownOnlySample.selected_cells.length,1,'unknown-only routes remain eligible for bounded evidence selection');
assert.equal(unknownOnlySample.selected_cells[0].members[0].contender,true);

const shared=cell(10,10,80,null),sharedRoutes=[
  {id:'share-a',name:'Share A',duration_s:600,cells:[cell(9,10,100,180),shared]},
  {id:'share-b',name:'Share B',duration_s:600,cells:[cell(11,10,100,190),structuredClone(shared)]}
];
const sharedPlan=context.SurvivePool.evolve(sharedRoutes,{ranked_routes:[],attempted_cell_ids:[],red_threshold_ppsqft:250},4,'shared-evolution',2);
assert.equal(sharedPlan.selected_cells.length,1,'a shared canonical cell is requested once');
assert.deepEqual(Array.from(sharedPlan.selected_cells[0].shared_route_ids),['share-a','share-b']);
assert.equal(sharedPlan.selected_cells[0].members.length,2,'the same evidence is credited to each traversing route');
assert.equal(sharedPlan.selected_cells[0].generation,2);

const attempted=context.SurvivePool.evolve([
  {id:'attempted',name:'Attempted',duration_s:600,cells:[cell(0,0,100,200),cell(1,0,200,null)]},
  {id:'comparison',name:'Comparison',duration_s:600,cells:[cell(5,0,100,200),cell(6,0,100,300)]}
],{ranked_routes:[],attempted_cell_ids:[cell(1,0,200,null).cell_id],red_threshold_ppsqft:250},5,'attempted-seed',3);
assert.equal(attempted.selected_cells.length,0,'previously attempted failed or uncertain cells cannot be automatically retried');
assert.equal(attempted.previously_attempted_cells,1);
assert.equal(attempted.provider_calls,0);
assert.equal(attempted.stopping_reason,'no_exact_unattempted_missing_cells');

const complete=context.SurvivePool.evolve([{id:'complete',name:'Complete',duration_s:600,cells:[stableRed,stableGreen]}],{ranked_routes:[],attempted_cell_ids:[],red_threshold_ppsqft:250},5,'complete-seed',4);
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
assert.deepEqual(Array.from(context.SurvivePool.pruneLowestRankedRoutes(Array.from({length:7},(_,i)=>({route_id:'r'+i,rank:i+1})),Array.from({length:7},(_,i)=>'r'+i)).disabled_route_ids).length,3,'ceil(3/8) pruning maps seven enabled routes to four survivors');
assert.throws(()=>context.SurvivePool.pruneLowestRankedRoutes([],['a'],1),/fraction/);

const roundZero=context.SurvivePool.pruneLeastCoveredUnprotectedRoutesBeforeSampling([
  {route_id:'unknown-a',coverage_pct:0},{route_id:'covered',coverage_pct:90},
  {route_id:'unknown-b',coverage_pct:0},{route_id:'mostly-covered',coverage_pct:70},
  {route_id:'partly-known',coverage_pct:20}
],['unknown-a','covered','unknown-b','mostly-covered','partly-known']);
assert.deepEqual(Array.from(roundZero.disabled_route_ids),['partly-known','mostly-covered'],'Round 0 culls the bottom 3/8 of routes at or above 20% coverage');
assert.deepEqual(Array.from(roundZero.protected_route_ids),['unknown-a','unknown-b'],'routes below 20% coverage are protected');
assert.deepEqual(Array.from(roundZero.enabled_route_ids),['unknown-a','covered','unknown-b'],'protected routes and better-covered unprotected routes survive Round 0');
assert.deepEqual(Array.from(context.SurvivePool.pruneLeastCoveredUnprotectedRoutesBeforeSampling([
  {route_id:'a',coverage_pct:0},{route_id:'b',coverage_pct:0},{route_id:'c',coverage_pct:0}
],['a','b','c']).disabled_route_ids),[],'all routes below 20% remain protected');
assert.deepEqual(Array.from(context.SurvivePool.pruneLeastCoveredUnprotectedRoutesBeforeSampling([
  {route_id:'a',coverage_pct:90},{route_id:'b',coverage_pct:90},{route_id:'c',coverage_pct:90},{route_id:'d',coverage_pct:0}
],['a','b','c','d']).disabled_route_ids),['a','b'],'coverage ties use route ID for a deterministic 3/8 cull');
const boundary=context.SurvivePool.pruneLeastCoveredUnprotectedRoutesBeforeSampling([
  {route_id:'protected',coverage_pct:19.99},{route_id:'eligible',coverage_pct:20}
],['protected','eligible']);
assert.deepEqual(Array.from(boundary.protected_route_ids),['protected'],'protection is strictly under 20%');
assert.deepEqual(Array.from(boundary.disabled_route_ids),['eligible'],'20% coverage is eligible for culling when a protected route remains');
const seventeen=Array.from({length:17},(_,i)=>({route_id:'route-'+i,coverage_pct:20+i}));
assert.equal(context.SurvivePool.pruneLeastCoveredUnprotectedRoutesBeforeSampling(seventeen,seventeen.map(row=>row.route_id)).disabled_route_ids.length,7,'17 unprotected routes cull ceil(3/8) = 7 before any AVM calls');

console.log('Automatic ranking evolution selector checks passed.');
