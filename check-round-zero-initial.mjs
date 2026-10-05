import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

// Exercise the real first screening path with offline responses. In particular,
// inspect the exact paid plan before its idle-pause authorization can run.
const elements=new Map();
function element(){return{value:'',children:[],disabled:false,hidden:false,open:false,checked:true,textContent:'',listeners:{},classList:{add(){},remove(){},toggle(){}},replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},setAttribute(){},removeAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;},focus(){},click(){},scrollIntoView(){},querySelector(){return null;},matches(){return false;}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
const ui={crypto:webcrypto,console,TextEncoder,document:{getElementById:get,querySelectorAll(){return[];},createElement:element,createElementNS:element,addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}}};
ui.window=ui;vm.createContext(ui);
for(const file of ['here-decoder.js','valhalla-decoder.js','route-avm.js','shotgun-gates.js','pool-screening.js'])vm.runInContext(readFileSync('dist/'+file,'utf8'),ui);
ui.SurviveAvm.enclosingHoneycomb=route=>({grid_version:'CHI1K-V1',grid_anchor:{latitude:41.91,longitude:-87.67},cells:(route.test_cells??route.cells).map(c=>({cell_id:c.cell_id,q:Number(c.cell_id.match(/Q([+-]\d+)/)[1]),r:0})),route_cell_count:(route.test_cells??route.cells).length,neighbor_rings:1});
ui.SurviveAvm.mapRoute=route=>({cells:(route.test_cells??route.cells).map(c=>({...c,polygon:[[c.longitude-.001,c.latitude-.001],[c.longitude+.001,c.latitude-.001],[c.longitude+.001,c.latitude+.001],[c.longitude-.001,c.latitude+.001]]})),authority_ranges:[],authority_offsets:null,authority_only_cell_count:0,avm_mapping:'mock',avm_status:'mapped_missing_values',authority_rule:'mock'});
ui.SurviveAvm.routeCellPositions=route=>({intervals:new Map((route.test_cells??route.cells).map((cell,index)=>[cell.cell_id,[[index*100,(index+1)*100]]])),total_non_highway_distance_m:(route.test_cells??route.cells).length*100});
vm.runInContext(readFileSync('dist/app.js','utf8').replace(/init\(\);\s*$/,''),ui);
const app=ui.SurviveDrive,state=app.getState();
state.routes=[0,10,20,50,90].map((known,index)=>{
  const cells=Array.from({length:10},(_,cellIndex)=>({cell_id:`CHI1K-V1-Q+${index*20+cellIndex}-R+0`,latitude:41.91,longitude:-87.68+(index*20+cellIndex)*.0001,outside_here_distance_m:100,estimate_ppsqft:cellIndex<known/10?300:null}));
  return{id:`route-${known}`,name:`Route ${known}`,length_m:null,duration_s:null,geometry:[[-87.68,41.91],[-87.66,41.91]],here_evidence:{sections:[]},section_offsets:[{start_offset:0,end_offset:1}],test_cells:cells,cells:cells.map(cell=>({...cell,polygon:[[cell.longitude-.001,cell.latitude-.001],[cell.longitude+.001,cell.latitude-.001],[cell.longitude+.001,cell.latitude+.001],[cell.longitude-.001,cell.latitude+.001]]}))};
});
state.active=0;get('red-cutoff').value='250';get('pool-screening-budget').value='1';
ui.setTimeout=()=>1;ui.clearTimeout=()=>{};
assert.equal(app.confirmRedThreshold(250),true);
const paths=[];
ui.fetch=async(path,options={})=>{
  paths.push(path);const body=options.body?JSON.parse(options.body):null;
  if(path==='/api/honeycomb/lookup'||path==='/api/honeycomb/construct')return Response.json({provider_calls:0,complete:true,entries:body.cells.map(c=>({cell_id:c.cell_id,status:'constructed'}))});
  if(path==='/api/cache/reference')return Response.json({provider_calls:0,attempted_entries:0});
  if(path==='/api/cache/lookup')return Response.json({provider_calls:0,entries:body.cells.map(c=>({cell_id:c.cell_id,status:'miss',entry:null}))});
  throw Error('A paid or unexpected request was made: '+path);
};
await app.preparePoolScreening();
assert.equal(state.poolScreening.status,'cache_only',state.poolScreening.error);
assert.deepEqual(Array.from(state.poolScreening.round_zero.protected_route_ids),['route-0','route-10']);
assert.equal(state.poolScreening.round_zero.disabled_route_ids.length,2);
assert.ok(state.poolScreening.round_zero.disabled_route_ids.every(id=>!['route-0','route-10'].includes(id)));
assert.equal(state.poolScreening.round_zero.enabled_route_ids.length,3);
assert.ok(['route-0','route-10'].every(id=>state.poolScreening.round_zero.enabled_route_ids.includes(id)));
assert.equal(state.poolScreening.round_zero.quota,3,'five original routes retain three after the first bottom-third cull');
assert.deepEqual(Array.from(state.poolScreening.enabled_route_ids).sort(),Array.from(state.poolScreening.round_zero.enabled_route_ids).sort(),'Round 0 inclusion reaches the screen state');
assert.equal(state.poolScreening.plan,null,'Round 0 stops before preparing any paid AVM plan');
assert.ok(!paths.some(path=>path.startsWith('/api/providers/')),'Round 0 makes no paid provider request');
assert.match(get('route-ranking-progress').textContent,/Round 0 is complete.*no paid AVM calls were started/i,'the Route Ranking progress clearly stops after Round 0');
assert.match(get('pool-round-zero-summary').textContent,/2.*protected|protected.*2/,'Round 0 decision is visible');
assert.match(get('next-round-inclusion-summary').textContent,/Cull 1: 3 of 5 original candidates INCLUDED/,'the first-round inclusion is visible');
assert.equal(app.resetRoundZeroTargetInclusion(4),true,'manual target reset applies after Round 0');
assert.equal(state.poolScreening.round_zero_target_included,4,'the selected target becomes the new baseline');
assert.equal(state.poolScreening.round_zero.quota,4,'Round 0 targets the new nominal inclusion count');
assert.equal(state.poolScreening.enabled_route_ids.length,4,'the reset re-includes candidates from the full ranking');
assert.equal(state.poolScreening.cull_round,1,'the reset clears later cull progression back to Round 0');
assert.deepEqual(Array.from(state.poolScreening.cull_fractions),[0.2],'the reset replaces accumulated culls with the new baseline share');
assert.equal(app.resetRoundZeroTargetInclusion(6),false,'targets above the candidate count are rejected');
const exported=app.buildSessionExport();
assert.equal(exported.pool_screening.round_zero.disabled_route_ids.length,1,'session export preserves the reset Round 0');
assert.equal(exported.pool_screening.round_zero_target_included,4,'session export preserves the manual baseline');
assert.deepEqual(Array.from(exported.pool_screening.enabled_route_ids).sort(),Array.from(state.poolScreening.round_zero.enabled_route_ids).sort(),'session export preserves first-round inclusion');
assert.equal(exported.pool_screening.cull_round,1,'session export preserves the cull number');
await app.prepareAutomaticRouteEvolution();
assert.equal(state.poolScreening.automatic_evolution_status,'idle','the retired multi-round automatic path stays inactive after Round 0');
assert.equal(state.poolScreening.automatic_evolution_plan,null,'Round 0 does not prepare a multi-round paid authorization');
assert.ok(!paths.some(path=>path.startsWith('/api/providers/')),'Round 0 makes no paid provider request');
exported.candidates.subject_profile={propertyType:'Single Family',bedrooms:3,bathrooms:2,squareFootage:1500,lookupSubjectAttributes:false};
app.loadSessionData(exported);
assert.equal(state.poolScreening.round_zero.disabled_route_ids.length,1,'session import restores the reset Round 0 decision');
assert.equal(state.poolScreening.round_zero_target_included,4,'session import restores the manual baseline');
assert.equal(state.poolScreening.enabled_route_ids.length,4,'session import restores the reset inclusion');
console.log('Initial Round 0 pre-screen, paid-call stop, and export checks passed.');
