import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const elements=new Map(),make=()=>({value:'',checked:false,children:[],listeners:{},classList:{add(){},remove(){},toggle(){}},addEventListener(type,callback){this.listeners[type]=callback;},setAttribute(name,value){this[name]=value;},removeAttribute(){},replaceChildren(){this.children=[];},append(...children){this.children.push(...children);}});
const sliders=[make(),make()],outputs=[make(),make()],statuses=[make(),make()];
const ui={document:{getElementById(id){if(!elements.has(id))elements.set(id,make());return elements.get(id);},createElement:make,querySelectorAll(selector){return selector==='[data-orange-mile-weight]'?sliders:selector==='[data-orange-mile-weight-value]'?outputs:selector==='[data-orange-mile-weight-status]'?statuses:[];}},fetch(){throw Error('Weighted reranking must not send any request');},clearTimeout(){}};ui.window=ui;
vm.createContext(ui);vm.runInContext(readFileSync('dist/pool-screening.js','utf8'),ui);vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),ui);
for(const name of ['renderRouteDirections','renderMetrics','renderChoice','renderEvaluationFlow','renderPoolScreening','notePoolRankingUpdated','updateNextAction','automaticRouteEvidenceSummary'])ui[name]=()=>null;
const app=ui.SurviveDrive,state=app.getState(),mile=1609.344;
const cell=(id,miles,value)=>({cell_id:id,outside_here_distance_m:miles*mile,estimate_ppsqft:value});
const route=(id,minutes,orange,unknown=0)=>({id,name:id,duration_s:minutes*60,cells:[cell(id+'orange',orange,100),cell(id+'green',1,500),...(unknown?[cell(id+'unknown',unknown,null)]:[])]});
const fast=route('fast',40,5),clean=route('clean',50,0),uncertain=route('uncertain',30,1,10),empty={id:'empty',name:'empty',duration_s:60,cells:[cell('empty-cell',1,null)]};
state.routes=[fast,clean,uncertain,empty];state.active=0;
state.poolScreening.results=ui.rankPoolResults(state.routes,null,[]);
assert.equal(state.minutesPerOrangeMile,3);
const order=()=>Array.from(app.rankedCandidateCards(),x=>x.route.id);
assert.deepEqual(order(),['clean','fast','uncertain','empty']);
const rows=new Map(state.poolScreening.results.map(x=>[x.route_id,x]));
assert.equal(rows.get('fast').ranking_score_minutes,55);assert.equal(rows.get('uncertain').ranking_score_minutes,63);assert.equal(rows.get('uncertain').red_distance_m,mile);assert.equal(rows.get('empty').rank,null);
ui.bindOrangeMileWeight();assert.ok(sliders.every(x=>x.value==='3'));
const originalRoutes=state.routes,originalCells=state.routes.map(x=>x.cells),counts=JSON.stringify(state.providerCalls);
sliders[0].value='0';sliders[0].listeners.input();
assert.deepEqual(order(),['uncertain','fast','clean','empty']);assert.ok(sliders.every(x=>x.value==='0'));assert.ok(outputs.every(x=>x.textContent==='0 min / Orange Mile'));
sliders[1].value='5';sliders[1].listeners.input();
assert.deepEqual(order(),['clean','fast','uncertain','empty']);assert.ok(sliders.every(x=>x.value==='5'));
assert.equal(state.routes,originalRoutes);assert.ok(state.routes.every((x,i)=>x.cells===originalCells[i]));assert.equal(state.active,0,'selected route identity stays fixed despite rank reorder');assert.equal(JSON.stringify(state.providerCalls),counts);
const card=elements.get('candidate-list').children[0].children[0];assert.match(card.children.find(x=>x.className==='pool-screening-candidate-status').textContent,/Score 50.0 min/);
// Complete and incomplete diagnostic ranks use the exact same combined score as the cards.
const evolved=ui.SurvivePool.evolve(state.routes,{red_threshold_ppsqft:200,minutes_per_orange_mile:5},0,'weighted-frontier',1);
for(const row of state.poolScreening.results)assert.equal(evolved.rank_intervals.find(x=>x.route_id===row.route_id).current_rank,row.rank);
assert.deepEqual(JSON.parse(JSON.stringify(evolved.rank_intervals.find(x=>x.route_id==='uncertain').score_bounds_minutes)),{lower:35,upper:85});
// Changing the tradeoff substitutes included routes without progressing the cull.
state.poolScreening.cull_round=2;state.poolScreening.generation=1;state.poolScreening.cull_fractions=[0.35,0.5];state.poolScreening.enabled_route_ids=['clean'];
let refreshes=0;ui.refreshCurrentCullSelection=source=>{assert.equal(source,'ranking_weight');refreshes++;};app.setMinutesPerOrangeMile(0);assert.equal(refreshes,1);assert.equal(state.poolScreening.cull_round,2);assert.deepEqual(state.poolScreening.cull_fractions,[0.35,0.5]);
// Any active authorized round keeps its immutable paid cell allowlist and inclusion set.
const frozen={status:'running',cells:[{cell_id:'authorized-only'}],maximum_attempts:1};state.busy=true;state.poolScreening.plan=frozen;state.poolScreening.status='running';const enabled=state.poolScreening.enabled_route_ids;
app.setMinutesPerOrangeMile(3);assert.equal(state.poolScreening.plan,frozen);assert.equal(state.poolScreening.status,'running');assert.equal(state.poolScreening.enabled_route_ids,enabled);assert.equal(refreshes,1);
state.busy=false;state.poolScreening.plan=null;
// Settings survive export/import, and old sessions get the requested default of 3.
ui.captureTripSetup=()=>({});app.setMinutesPerOrangeMile(7.5);const saved=app.buildSessionExport();assert.equal(saved.settings.minutes_per_orange_mile,7.5);
for(const name of ['applyMapCellEvidenceToRoute','renderRedThreshold','renderExclusionZoneLevel','selectRoute'])ui[name]=()=>null;
ui.loadSavedRoutes=()=>state.routes;ui.remapImportedValhallaRoutes=routes=>routes;ui.restoreSavedAutomaticEvidence=()=>({unique_cells:0,route_cells:0});
app.setMinutesPerOrangeMile(0);app.loadSessionData(saved);assert.equal(state.minutesPerOrangeMile,7.5);assert.ok(sliders.every(x=>x.value==='7.5'));assert.equal(state.poolScreening.results.find(x=>x.route_id==='fast').ranking_score_minutes,77.5);
delete saved.settings.minutes_per_orange_mile;app.loadSessionData(saved);assert.equal(state.minutesPerOrangeMile,3);
for(const value of [-1,21,NaN,Infinity,'bad'])assert.throws(()=>app.setMinutesPerOrangeMile(value),/between 0 and 20/);
assert.equal(state.minutesPerOrangeMile,3);assert.equal(JSON.stringify(state.providerCalls),counts);
const html=readFileSync('dist/index.html','utf8');assert.equal((html.match(/data-orange-mile-weight type="range"/g)||[]).length,2);assert.match(html,/min="0" max="20" step="0.5" value="3"/);
console.log('Weighted ranking passed: immediate input, two synchronized sliders, score tradeoffs, unknown-mile bounds, stable selection, unchanged cull quota, frozen active authorization, session roundtrip, old-session default, and invalid-input checks. Network/provider requests: 0.');
