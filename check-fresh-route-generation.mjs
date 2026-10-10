import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8'),html=readFileSync('dist/index.html','utf8');
const elements=new Map(),cancelled=[];let requests=0;
function element(){return{value:'',textContent:'',hidden:false,disabled:false,style:{},listeners:{},classList:{add(){},remove(){},toggle(){}},replaceChildren(){},append(){},setAttribute(){},removeAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
const ui={document:{getElementById:get,querySelectorAll:()=>[],activeElement:null},fetch(){requests++;throw Error('Cutoff edits must not send provider requests');},clearTimeout:id=>cancelled.push(id),setTimeout(){throw Error('An already ranked pool must not schedule another provider workflow');}};ui.window=ui;vm.createContext(ui);
vm.runInContext(readFileSync('dist/pool-screening.js','utf8'),ui);
vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),ui);
// Keep the actual cutoff, metrics, rank, cull, plan invalidation and discard logic.
// Stub presentation only so this regression can exercise populated pools offline.
vm.runInContext(`
 notice=message=>$('notice').textContent=message;log=message=>state.history.push(message);updateNextAction=()=>{};
 renderCandidates=()=>{};renderMetrics=()=>{};renderCells=()=>{};renderChoice=()=>{};
 renderEvaluationFlow=()=>{};renderPoolScreening=()=>{};drawMap=()=>{};
 renderFreshRouteCandidatesButton=()=>{};renderRankingMode=()=>{};renderManualRoundCost=()=>{};
 drawRedExclusionZoneLayer=()=>{};dismissMapAvm=()=>{};closeRouteCellHover=()=>{};updateStreetView=()=>{};
 renderRouteRegenerationNotice=()=>{};renderValhallaBatchProgress=()=>{};
`,ui);
const app=ui.SurviveDrive,state=app.getState(),cell=(id,distance,value)=>({cell_id:id,latitude:41.9,longitude:-87.7,outside_here_distance_m:distance,estimate_ppsqft:value});
const routes=[
 {id:'a',name:'Route A',duration_s:900,cells:[cell('a1',100,150),cell('a2',900,450)]},
 {id:'b',name:'Route B',duration_s:800,cells:[cell('b1',500,250),cell('b2',500,600)]},
 {id:'c',name:'Route C',duration_s:700,cells:[cell('c1',800,100),cell('c2',200,450)]}
];
state.routes=routes;state.active=1;state.redThresholdConfirmed=true;
state.shotgunSuggestions={gates:[{id:'s',selected:true}]};state.destinationShotgunSuggestions={gates:[{id:'d',selected:true}]};
state.draft={here:{status:'shotgun_batch_complete'},shotgun:{batch:{status:'completed',requests:[]}},exclusion_zones:{cutoff_ppsqft:200,polygons:[]}};
const draft=JSON.stringify(state.draft),gates=JSON.stringify([state.shotgunSuggestions,state.destinationShotgunSuggestions]),evidence=JSON.stringify(routes),calls=JSON.stringify(state.providerCalls);
const screen=state.poolScreening;screen.results=ui.rankPoolResults(routes,null,[]);screen.status='complete';screen.generation=1;screen.cull_round=1;screen.cull_fractions=[2/3];screen.enabled_route_ids=['b'];
const rank=id=>screen.results.find(row=>row.route_id===id).rank;
assert.equal(rank('b'),1);
get('red-cutoff').value='300';get('color-upper').value=String(ui.colorUpperSliderPosition(500));
// Exercise the actual registered release action, including mirrored controls' canonical path.
vm.runInContext(source.split('\n').find(line=>line.startsWith("$('red-cutoff').addEventListener('change'")),ui);
get('red-cutoff').listeners.change();
assert.equal(state.routes,routes,'Orange release keeps the same candidate array and route identities');
assert.equal(JSON.stringify(routes),evidence,'Orange release retains every AVM value');
assert.equal(state.redThresholdPpsqft,300);assert.equal(state.mapColorLowerPpsqft,300);assert.equal(state.exclusionZoneThresholdPpsqft,200);
assert.equal(rank('a'),1);assert.equal(rank('b'),2);assert.equal(screen.results.find(row=>row.route_id==='b').red_distance_m,500);
assert.deepEqual(Array.from(screen.enabled_route_ids),['a'],'the newly best route replaces the prior included route');
assert.equal(screen.cull_round,1,'a cutoff rerank never advances the cull round');assert.equal(screen.cull_fractions.length,1);
assert.equal(JSON.stringify(state.draft),draft,'the current route request and frozen exclusions remain intact');assert.equal(JSON.stringify([state.shotgunSuggestions,state.destinationShotgunSuggestions]),gates);
assert.equal(state.active,1,'the selected route remains selected even if its rank changes');
assert.equal(screen.status,'refreshed_after_cutoff_change');assert.equal(requests,0);assert.equal(JSON.stringify(state.providerCalls),calls);
// Applying without a preceding slider change must also preserve the route batch.
screen.plan={plan_id:'stale-paid-plan',attempt_records:[]};screen.automatic_evolution_plan=screen.plan;screen.automatic_evolution_status='prepared';state.avmPlan={plan_id:'stale-selected-plan'};
vm.runInContext('automaticEvolutionAutoApprovalTimer=123',ui);
assert.equal(app.confirmRedThreshold(250),true);assert.equal(state.routes,routes);assert.equal(state.avmPlan,null);assert.equal(screen.plan,null);assert.equal(screen.automatic_evolution_status,'idle');assert.ok(cancelled.includes(123),'changing Orange cancels any pending approval timer');assert.equal(requests,0);
const priorRows=screen.results;assert.equal(app.confirmColorUpper(900),true);assert.equal(screen.results,priorRows,'upper-bound edits never rerank or discard candidates');
state.busy=true;assert.equal(app.previewColorScale(350,900),false);assert.equal(app.confirmRedThreshold(350),false);state.busy=false;
assert.equal(state.redThresholdPpsqft,250);assert.equal(state.routes,routes);
assert.equal(ui.setExclusionZoneThreshold(200),true);assert.equal(state.routes,routes,'an unchanged Exclusion Cutoff does not discard routes');
assert.equal(ui.setExclusionZoneThreshold(180),true);assert.equal(state.routes.length,0,'only a changed Exclusion Cutoff among PPSQFT controls clears candidates');assert.equal(screen.results.length,0);assert.equal(screen.cull_round,0);assert.equal(state.exclusionZoneThresholdPpsqft,180);assert.equal(state.draft.here.status,'superseded_by_conditioning_change');assert.equal(JSON.stringify([state.shotgunSuggestions,state.destinationShotgunSuggestions]),gates);assert.equal(requests,0,'Exclusion change requires an explicit fresh batch without starting it');
assert.match(html,/Changing Orange PPSQFT reranks the existing routes without requesting new candidates/);
console.log('Cutoff regression passed: Orange release and Apply rerank the existing pool, preserve candidates/evidence/gates/frozen exclusions/active route, substitute within the existing cull quota, cancel stale approval, and send zero provider calls. Upper changes keep ranking; changed Exclusion requires a fresh batch.');
