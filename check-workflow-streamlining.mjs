import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=readFileSync('dist/app.js','utf8'),html=readFileSync('dist/index.html','utf8');
const nodes=new Map();let now=1000;
const element=()=>({value:'',checked:false,children:[],attributes:{},listeners:{},hidden:false,disabled:false,textContent:'',classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},getAttribute(k){return this.attributes[k]??null;},append(...c){this.children.push(...c);},replaceChildren(...c){this.children=c;},addEventListener(k,f){this.listeners[k]=f;},scrollIntoView(){},focus(){}});
const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
const ui={crypto:webcrypto,TextEncoder,TextDecoder,Response,Headers,AbortSignal,Date:class extends Date{static now(){return now;}},document:{getElementById:get,querySelector:()=>null,querySelectorAll:()=>[],createElement:element,createElementNS:element,addEventListener(){}}};ui.window=ui;vm.createContext(ui);
for(const f of ['route-avm.js','pool-screening.js','app.js'])vm.runInContext(readFileSync('dist/'+f,'utf8').replace(/\ninit\(\);\s*$/,''),ui);
const state=ui.SurviveDrive.getState();
// The initial wait is outside the ancestor hidden while results are empty.
assert.ok(html.indexOf('id="ranking-mode-wait"')<html.indexOf('id="pool-screening-section"'));
assert.ok(html.indexOf('id="workflow-status"')<html.indexOf('class="workbench"'));
state.busy=true;state.stage='evaluate';state.poolScreening.status='preparing';state.poolScreening.ranking_mode_guidance_pending=true;
ui.workflowPhase('Checking shared map cells — 500 of 900. No paid value lookups.');ui.renderPoolScreening();
assert.equal(get('pool-evolution-controls').hidden,true);assert.equal(get('workflow-status').hidden,false);assert.equal(get('ranking-mode-wait').hidden,false);assert.match(get('ranking-mode-wait').textContent,/500 of 900/);assert.equal(get('manual-route-mode').disabled,true);
ui.workflowPhase('Checking shared map cells — 800 of 900. No paid value lookups.');assert.match(get('ranking-mode-wait').textContent,/800 of 900/,'local wait follows each current phase');
now=6500;ui.renderWorkflowStatus();assert.match(get('workflow-elapsed').textContent,/5 seconds/);assert.match(get('workflow-status-text').textContent,/WAIT.*800 of 900.*do not need to click/);
get('notice').textContent='Screening stopped: registry unavailable.';state.busy=false;state.poolScreening.status='blocked';ui.renderWorkflowStatus();assert.equal(get('workflow-status').hidden,true);assert.equal(get('workflow-status').getAttribute('aria-busy'),null);assert.equal(get('notice').hidden,false);assert.equal(state.workflow_timings.at(-1).event,'work_finished');
// A later Manual round, including its failure, owns the primary summary.
state.poolScreening.automatic_evolution_plan={execution_ledger:[{event:'automatic_round_completed'}],attempt_records:[],cells:[]};state.poolScreening.automatic_evolution_status='completed';state.poolScreening.mode='evolution';state.poolScreening.status='complete';state.poolScreening.generation=4;state.poolScreening.provider_attempts=1;
ui.renderPoolRankingProgress();ui.renderPoolScreening();assert.match(get('pool-ranking-heading').textContent,/Manual round 4 complete/);assert.match(get('pool-screening-summary').textContent,/Manual round 4 complete/);assert.equal(get('approve-pool-screening').hidden,true);
state.poolScreening.status='interrupted';state.poolScreening.error='Connection lost';ui.renderPoolRankingProgress();assert.match(get('pool-ranking-heading').textContent,/Manual round stopped/);assert.match(get('pool-ranking-guidance').textContent,/Connection lost/);
// Actual geometry: shared cells are looked up/constructed once; every route retains its proof.
const template={name:'Shared corridor',geometry:[[-87.70,41.90],[-87.69,41.89],[-87.68,41.88]],cells:[],length_m:3200,duration_s:300,here_evidence:{sections:[{spans:[{offset:0,streetAttributes:[]}]}]},section_offsets:[{start_offset:0,end_offset:2}]};
const routes=[1,2,3].map(id=>({...structuredClone(template),id:'route-'+id}));
for(const route of routes)Object.assign(route,ui.SurviveAvm.mapRoute(route));routes[0].cells[0].estimate_ppsqft=321;
state.routes=routes;state.active=-1;state.busy=true;state.poolScreening.status='preparing';
const calls=[];let failConstruct=false;
ui.fetch=async(path,options)=>{assert.match(path,/^\/api\/honeycomb\/(lookup|construct)$/);const body=JSON.parse(options.body);calls.push({path,body});return Response.json({provider_calls:0,complete:!failConstruct,entries:body.cells.map(c=>({cell_id:c.cell_id,status:path.endsWith('lookup')||failConstruct?'missing':'constructed'}))});};
const count=ui.SurviveAvm.enclosingHoneycomb(routes[0]).cells.length;await ui.ensurePoolCoverage(routes);
assert.equal(calls.filter(c=>c.path.endsWith('lookup')).flatMap(c=>c.body.cells).length,count);assert.equal(calls.filter(c=>c.path.endsWith('construct')).flatMap(c=>c.body.cells).length,count);
assert.ok(routes.every(r=>r.honeycomb.status==='complete'));assert.equal(routes[0].cells[0].estimate_ppsqft,321);
const before=calls.length;await ui.ensurePoolCoverage(routes);assert.equal(calls.length,before,'unchanged route proofs require no registry request');
routes[1].geometry[1][0]+=.04;await ui.ensurePoolCoverage(routes);assert.ok(calls.length>before,'changed geometry is reverified');
const broken={...structuredClone(template),id:'broken'};failConstruct=true;await assert.rejects(ui.ensurePoolCoverage([broken]),/incomplete/);assert.notEqual(broken.honeycomb?.status,'complete');
// Separate regional recipes may not share registry proofs, even on identical q/r coordinates.
failConstruct=false;calls.length=0;const regional={...structuredClone(template),id:'regional',geometry:[[-81.70,30.46],[-81.66,30.42],[-81.61,30.42]]};await ui.ensurePoolCoverage([{...structuredClone(template),id:'local'},regional]);assert.equal(new Set(calls.map(c=>c.body.grid_version)).size,2);
const originalGrid=ui.SurviveAvm.enclosingHoneycomb;ui.SurviveAvm.enclosingHoneycomb=r=>{const g=originalGrid(r);if(r.id==='conflict')g.cells[0].q+=1;return g;};await assert.rejects(ui.ensurePoolCoverage([{...structuredClone(template),id:'normal'},{...structuredClone(template),id:'conflict'}]),/coordinates conflict/);
assert.doesNotMatch(source,/setTimeout\(resolve,2500\)/);
console.log('Passed visible initial progress, elapsed timing and error cleanup, latest Manual state, shared grid deduplication, proof reuse/invalidation, regional isolation, and fail-closed construction/conflicts. Live provider calls: 0.');
