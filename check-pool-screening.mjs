import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import worker from './dist/server/index.js';

// Run the real browser preparation and candidate-card toggle code against
// bounded offline API mocks. RentCast authorization and attempt calls are
// recorded and answered locally; no external provider is contacted.
const elements=new Map();
function element(){return{value:'',children:[],disabled:false,hidden:false,open:false,checked:true,textContent:'',listeners:{},classList:{add(){},remove(){},toggle(){}},replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},setAttribute(){},removeAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;},focus(){},click(){},scrollIntoView(){},querySelector(){return null;},matches(){return false;}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
const ui={crypto:webcrypto,console,TextEncoder,document:{getElementById:get,querySelectorAll(){return[];},createElement:element,createElementNS:element,addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}}};ui.window=ui;vm.createContext(ui);
for(const file of ['here-decoder.js','route-avm.js','shotgun-gates.js','pool-screening.js'])vm.runInContext(readFileSync('dist/'+file,'utf8'),ui);
const shared={cell_id:'CHI1K-V1-Q+0-R+0',latitude:41.91063814,longitude:-87.66769738,outside_here_distance_m:120,estimate_ppsqft:null};
const left={cell_id:'CHI1K-V1-Q-1-R+0',latitude:41.91063814,longitude:-87.6785,outside_here_distance_m:80,estimate_ppsqft:null};
const right={cell_id:'CHI1K-V1-Q+1-R+0',latitude:41.91063814,longitude:-87.6568,outside_here_distance_m:160,estimate_ppsqft:null};
ui.SurviveAvm.enclosingHoneycomb=route=>({grid_version:'CHI1K-V1',grid_anchor:{latitude:41.91,longitude:-87.67},cells:route.test_cells.map(c=>({cell_id:c.cell_id,q:Number(c.cell_id.match(/Q([+-]\d+)/)[1]),r:Number(c.cell_id.match(/R([+-]\d+)/)[1])})),route_cell_count:route.test_cells.length,neighbor_rings:1});
ui.SurviveAvm.mapRoute=route=>({cells:route.test_cells.map(c=>({...c,polygon:[[c.longitude-.001,c.latitude-.001],[c.longitude+.001,c.latitude-.001],[c.longitude+.001,c.latitude+.001],[c.longitude-.001,c.latitude+.001]]})),authority_ranges:[],authority_offsets:null,authority_only_cell_count:0,avm_mapping:'mock',avm_status:'mapped_missing_values',authority_rule:'mock'});
ui.SurviveAvm.routeCellPositions=route=>({intervals:new Map(route.test_cells.map((cell,index)=>[cell.cell_id,[[index*100,(index+1)*100]]])),total_non_highway_distance_m:route.test_cells.length*100});
vm.runInContext(readFileSync('dist/app.js','utf8').replace(/init\(\);\s*$/,''),ui);
const app=ui.SurviveDrive,state=app.getState();
const sevenIds=Array.from({length:7},(_,i)=>'route-'+i),sevenCells=new Map(sevenIds.map(id=>[id,new Set(Array.from({length:10},(_,i)=>id+'-cell-'+i))])),scheduleSeven=app.automaticEvolutionWorstCase(sevenCells,sevenIds,5);
assert.deepEqual(Array.from(scheduleSeven.round_schedule,row=>row.enabled_route_count),[7,4,2],'a 40% ceil cull keeps four then two routes over three additional rounds');
assert.equal(scheduleSeven.maximum_attempts,65,'the paid-call ceiling uses the declared cull schedule, not all routes for all rounds');
const twentyIds=Array.from({length:20},(_,i)=>'wide-route-'+i),twentyCells=new Map(twentyIds.map(id=>[id,new Set(Array.from({length:10},(_,i)=>id+'-cell-'+i))]));
assert.equal(app.automaticEvolutionWorstCase(twentyCells,twentyIds,5).maximum_attempts,195,'larger pools receive a bounded but accurate three-round ceiling');
// Route-local quota regression: five pulls must span unknown Start, middle,
// and destination sections instead of inheriting pool-wide clustering.
const spreadPositions=[0.03,0.08,0.2,0.42,0.49,0.65,0.91,0.97],spreadUnknown=[true,true,false,true,true,false,true,true],spreadRoute={id:'spread-route',name:'Spread Route',cells:spreadPositions.map((position,index)=>({cell_id:'CHI1K-V1-Q+'+index+'-R+0',latitude:41.91,longitude:-87.68+index*0.001,outside_here_distance_m:100,estimate_ppsqft:spreadUnknown[index]?null:400}))};
const spreadPlan=ui.SurvivePool.routeQuotaPlan([spreadRoute],5,['spread-route'],{route_positions:{'spread-route':spreadRoute.cells.map((cell,index)=>[cell.cell_id,spreadPositions[index]])}});
assert.equal(spreadPlan.selected_count,5,'the requested five-cell quota is preserved');
assert.equal(new Set(spreadPlan.selected_cells.map(cell=>cell.cell_id)).size,5,'route-local spacing does not duplicate a cell');
const chosenPositions=spreadPlan.selected_cells.map(cell=>spreadPositions[Number(cell.cell_id.match(/Q\+(\d+)/)[1])]);
assert.ok(chosenPositions.some(position=>position<=0.1),'an eligible Start-side unknown cell is represented');
assert.ok(chosenPositions.some(position=>position>=0.4&&position<=0.6),'a middle unknown section is represented');
assert.ok(chosenPositions.some(position=>position>=0.9),'an eligible destination-side unknown cell is represented');
// Known AVM cells split represented sections into short gaps. With quota 2,
// choose the two uncovered endpoint gaps rather than more unknowns in the dense center.
const denseKnownPositions=Array.from({length:9},(_,index)=>0.4+index*0.02),densePositions=[0.02,0.1,0.43,0.5,0.97,...denseKnownPositions].sort((a,b)=>a-b),denseKnown=new Set(denseKnownPositions),denseRoute={id:'dense-route',name:'Dense Evidence Route',cells:densePositions.map((position,index)=>({cell_id:'CHI1K-V1-Q+'+index+'-R+0',latitude:41.9,longitude:-87.7+index*0.001,outside_here_distance_m:100,estimate_ppsqft:denseKnown.has(position)?300:null}))};
const densePlan=ui.SurvivePool.routeQuotaPlan([denseRoute],2,['dense-route'],{route_positions:{'dense-route':denseRoute.cells.map((cell,index)=>[cell.cell_id,densePositions[index]])}});
const denseChosenPositions=densePlan.selected_cells.map(cell=>densePositions[Number(cell.cell_id.match(/Q\+(\d+)/)[1])]);
assert.ok(denseChosenPositions.some(position=>position<=0.1),'the uncovered Start-side evidence gap is selected');
assert.ok(denseChosenPositions.some(position=>position>=0.9),'the uncovered destination-side evidence gap remains eligible');
assert.ok(!denseChosenPositions.some(position=>position===0.43||position===0.5),'unknown cells in the already densely represented section are avoided');
// When Start already has close known anchors, the farthest eligible unknown
// position is at the destination, so the endpoint is chosen by evidence gap.
const anchoredStartPositions=[0.02,0.05,0.08,0.03,0.4,0.5,0.6,0.98].sort((a,b)=>a-b),anchoredStartKnown=new Set([0.02,0.05,0.08]),anchoredStartRoute={id:'anchored-start-route',name:'Anchored Start Route',cells:anchoredStartPositions.map((position,index)=>({cell_id:'CHI1K-V1-Q+'+index+'-R+1',latitude:41.9,longitude:-87.7+index*0.001,outside_here_distance_m:100,estimate_ppsqft:anchoredStartKnown.has(position)?300:null}))};
const anchoredStartPlan=ui.SurvivePool.routeQuotaPlan([anchoredStartRoute],1,['anchored-start-route'],{route_positions:{'anchored-start-route':anchoredStartRoute.cells.map((cell,index)=>[cell.cell_id,anchoredStartPositions[index]])}});
const anchoredStartChosen=anchoredStartPositions[Number(anchoredStartPlan.selected_cells[0].cell_id.match(/Q\+(\d+)/)[1])];
assert.equal(anchoredStartChosen,0.98,'an already represented Start does not displace the underrepresented destination');
const routeA={id:'pool-route-a',name:'Pool Route A',geometry:[[-87.68,41.91],[-87.66,41.91]],here_evidence:{sections:[]},section_offsets:[{start_offset:0,end_offset:1}],test_cells:[shared,left],cells:[]};
const routeB={id:'pool-route-b',name:'Pool Route B',geometry:[[-87.67,41.92],[-87.65,41.92]],here_evidence:{sections:[]},section_offsets:[{start_offset:0,end_offset:1}],test_cells:[{...shared},right],cells:[]};
state.routes=[routeA,routeB];state.active=0;get('red-cutoff').value='250';get('red-cutoff').value='250';assert.equal(app.confirmRedThreshold(250),true);
let rentcastCalls=0,hereCalls=0,poolAuthorizationBodies=[],poolAttemptBodies=[],automaticAuthorizationBodies=[];
ui.fetch=async(path,options={})=>{
  const body=options.body?JSON.parse(options.body):null;
  if(path==='/api/honeycomb/lookup')return Response.json({provider_calls:0,entries:body.cells.map(c=>({cell_id:c.cell_id,status:'constructed'}))});
  if(path==='/api/honeycomb/construct')return Response.json({provider_calls:0,complete:true,entries:body.cells.map(c=>({cell_id:c.cell_id,status:'constructed'}))});
  if(path==='/api/cache/reference')return Response.json({provider_calls:0,attempted_entries:0});
  if(path==='/api/cache/lookup')return Response.json({provider_calls:0,entries:body.cells.map(c=>({cell_id:c.cell_id,status:'miss',entry:null}))});
  if(path==='/api/providers/status')return Response.json({here_server_key:true,rentcast_server_key:true});
  if(path==='/api/providers/avm/approve'){if(body.purpose==='automatic_route_evolution'){automaticAuthorizationBodies.push(body);return Response.json({error:'Offline fixture rejects authorization before any paid attempts.',provider_attempted:false},{status:400});}rentcastCalls++;poolAuthorizationBodies.push(body);return Response.json({plan_id:body.plan_id,maximum_attempts:body.maximum_attempts,serial:true,retries:0,failures_consume_budget:true,cells:body.cells});}
  if(path==='/api/providers/avm/attempt'){rentcastCalls++;poolAttemptBodies.push(body);const cell=state.poolScreening.plan?.cells[body.attempt_index];if(!cell)throw Error('Offline test attempted a cell outside its exact pool plan.');return body.attempt_index===0?Response.json({provider_attempted:true,error:'Offline fixture failure'}):Response.json({provider_attempted:true,estimate_ppsqft:425,acquired_at:'2026-01-01T00:00:00.000Z',source_kind:'live',cell:{cell_id:cell.cell_id,latitude:cell.latitude,longitude:cell.longitude}});}
  if(path==='/api/providers/here/search'){hereCalls++;throw Error('Offline test blocked HERE request.');}
  throw Error('Unexpected mocked path '+path);
};
let scheduledPreparation=null;
ui.setTimeout=callback=>{scheduledPreparation=callback;return 1;};
ui.clearTimeout=()=>{};
assert.equal(app.confirmRedThreshold(250),true);
assert.equal(typeof scheduledPreparation,'function','applying the Red cutoff schedules the free pool screen');
scheduledPreparation();
await new Promise(resolve=>setTimeout(resolve,20));
assert.equal(state.poolScreening.status,'cache_only','the zero-cell default prepares the cache-only ranking automatically');
assert.equal(rentcastCalls,0);
assert.equal(hereCalls,0);
delete ui.setTimeout;
delete ui.clearTimeout;
assert.equal(state.poolScreening.status,'cache_only','initial screening ends after free Round 0');
assert.equal(state.poolScreening.plan,null,'Round 0 does not prepare a paid plan');
assert.match(get('route-ranking-progress').textContent,/Round 0 is complete.*no paid AVM calls were started/i);
assert.equal(rentcastCalls,0);
assert.equal(poolAuthorizationBodies.length,0);
console.log('Passed cache-only Round 0, visible ranked cards, and no automatic paid follow-up.');
