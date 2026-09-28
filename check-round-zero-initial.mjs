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
for(const file of ['here-decoder.js','route-avm.js','shotgun-gates.js','pool-screening.js'])vm.runInContext(readFileSync('dist/'+file,'utf8'),ui);
ui.SurviveAvm.enclosingHoneycomb=route=>({grid_version:'CHI1K-V1',grid_anchor:{latitude:41.91,longitude:-87.67},cells:route.test_cells.map(c=>({cell_id:c.cell_id,q:Number(c.cell_id.match(/Q([+-]\d+)/)[1]),r:0})),route_cell_count:route.test_cells.length,neighbor_rings:1});
ui.SurviveAvm.mapRoute=route=>({cells:route.test_cells.map(c=>({...c,polygon:[[c.longitude-.001,c.latitude-.001],[c.longitude+.001,c.latitude-.001],[c.longitude+.001,c.latitude+.001],[c.longitude-.001,c.latitude+.001]]})),authority_ranges:[],authority_offsets:null,authority_only_cell_count:0,avm_mapping:'mock',avm_status:'mapped_missing_values',authority_rule:'mock'});
ui.SurviveAvm.routeCellPositions=route=>({intervals:new Map(route.test_cells.map((cell,index)=>[cell.cell_id,[[index*100,(index+1)*100]]])),total_non_highway_distance_m:route.test_cells.length*100});
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
assert.equal(state.poolScreening.status,'prepared',state.poolScreening.error);
assert.deepEqual(Array.from(state.poolScreening.round_zero.protected_route_ids),['route-0','route-10']);
assert.deepEqual(Array.from(state.poolScreening.round_zero.disabled_route_ids),['route-20','route-50']);
assert.deepEqual(Array.from(state.poolScreening.round_zero.enabled_route_ids),['route-0','route-10','route-90']);
assert.deepEqual(Array.from(state.poolScreening.plan.selection_policy.enabled_route_ids),['route-0','route-10','route-90'],'the first exact paid plan contains Round 0 survivors only');
assert.ok(state.poolScreening.plan.cells.every(cell=>cell.members.some(member=>['route-0','route-10','route-90'].includes(member.route_id))),'every selected cell belongs to a Round 0 survivor');
assert.ok(!paths.some(path=>path.startsWith('/api/providers/')),'Round 0 and plan preparation make no paid provider request');
assert.match(get('pool-round-zero-summary').textContent,/2.*protected|protected.*2/,'Round 0 decision is visible');
const exported=app.buildSessionExport();
assert.deepEqual(Array.from(exported.pool_screening.round_zero.disabled_route_ids),['route-20','route-50'],'session export preserves Round 0');
exported.candidates.subject_profile={propertyType:'Single Family',bedrooms:3,bathrooms:2,squareFootage:1500,lookupSubjectAttributes:false};
app.loadSessionData(exported);
assert.deepEqual(Array.from(state.poolScreening.round_zero.disabled_route_ids),['route-20','route-50'],'session import restores the same Round 0 decision');
console.log('Initial Round 0 pre-screen and export checks passed.');
