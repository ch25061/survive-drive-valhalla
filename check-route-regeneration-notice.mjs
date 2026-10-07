import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const html=readFileSync('dist/index.html','utf8');
const helpers=source.slice(source.indexOf('function routeExclusionEvidenceSnapshot('),source.indexOf('function bindHttpErrorPanel('));
const oneLine=name=>source.split('\n').find(line=>line.startsWith('function '+name+'('));
for(const name of ['allKnownAvmCells','mapEvidenceKey','routeExclusionAreaCells','routeExclusionPlan'])assert.ok(oneLine(name),name);
const markup=html.match(/<section id="route-regeneration-notice"[\s\S]*?<\/section>/)?.[0];
assert.ok(markup&&html.indexOf(markup)<html.indexOf('id="primary-ranking"'),'the notice sits above rankings');
assert.doesNotMatch(markup+helpers,/alertdialog|aria-modal|\.focus\(|scrollIntoView|appFetch\(|providerFetch\(/,'the advisory never interrupts or makes requests');
assert.match(source,/function drawMap\([^\n]*renderRouteRegenerationNotice\(\)/,'map/evidence updates refresh the advisory');
assert.match(source,/function renderFreshRouteCandidatesButton\(\)\{renderRouteRegenerationNotice\(\)/,'busy-state transitions refresh the button');
assert.match(source,/state\.routeExclusionEvidence=routeExclusionEvidenceSnapshot\(draft\.exclusion_zones\)/,'returned candidates retain the evidence frozen before route generation');
assert.match(source,/route_exclusion_evidence:state\.routeExclusionEvidence/,'session export preserves the batch baseline');
assert.match(source,/state\.routeExclusionEvidence=isSession\?routeExclusionEvidenceSnapshot\(input\.route_exclusion_evidence\):null/,'session import restores the baseline and clears stale context');
assert.match(source,/if\(state\.routes\.length&&!discardCandidatesForFreshRouteGeneration\('Fresh route generation requested'\)\)return false;try\{await stageDraft\(\)/,'a user-requested regeneration discards the old batch before starting the new one');

function harness(legacy=false){
  const nodes=new Map();let placements=0,generations=0,ready=true,cutoff=200;
  const active={};
  const node=(id='')=>({id,hidden:true,disabled:false,textContent:'',children:[],listeners:new Map(),attributes:new Map(),
    append(...children){this.children.push(...children);for(const child of children)nodes.set(child.id,child);},
    setAttribute(name,value){this.attributes.set(name,value);},
    before(child){placements++;nodes.set(child.id,child);},
    addEventListener(type,callback){this.listeners.set(type,callback);},
    focus(){throw Error('The notice must not take focus');}});
  nodes.set('primary-ranking',node('primary-ranking'));
  for(const id of ['origin','destination'])nodes.set(id,{value:id==='origin'?'41,-87':'42,-88'});
  if(!legacy)for(const id of ['route-regeneration-notice','route-regeneration-status','regenerate-after-evidence'])nodes.set(id,node(id));
  const state={routes:[{cells:[]}],map_cell_evidence:[],busy:false,routeExclusionEvidence:null};
  const context=vm.createContext({state,knownCacheCells:[],retainedRouteKnownCells:new Map(),routeHighwayMasks:{},
    document:{activeElement:active,createElement:()=>node()},$:id=>nodes.get(id),
    exclusionZoneThreshold:()=>cutoff,validMapEstimate:value=>Number.isFinite(value)&&value>0,
    coordinates:value=>value.split(',').map(Number),selectedShotgunGates:()=>[],
    routeOptionsFromForm:()=>({highways:0,tolls:0}),knownTripEndpointCellIds:()=>new Set(),
    RedExclusionZones:{clusterRedCells:()=>[],polygonsPerimeterMeters:()=>0},
    routeConditioningLocked:()=>state.busy,gateResolutionReady:()=>ready,
    refreshShotgunBatchReadinessForFreshRoute:()=>ready,money:value=>'$'+value.toFixed(2),
    generateFreshRouteCandidates:()=>{generations++;},
  });
  vm.runInContext(['mapEvidenceKey','allKnownAvmCells','routeExclusionAreaCells','routeExclusionPlan'].map(oneLine).join('\n')+'\n'+helpers,context);
  context.bindRouteRegenerationNotice();
  return{state,context,nodes,active,get placements(){return placements;},get generations(){return generations;},set ready(value){ready=value;},set cutoff(value){cutoff=value;},
    freeze(){state.routeExclusionEvidence=context.routeExclusionEvidenceSnapshot(context.routeExclusionPlan());},
    render(){context.renderRouteRegenerationNotice();}};
}
const cell=(id,value,latitude=41.5,longitude=-87.5)=>({cell_id:id,latitude,longitude,estimate_ppsqft:value,polygon:[[-87.51,41.49],[-87.49,41.49],[-87.5,41.51]]});
for(const legacy of [false,true]){
  const h=harness(legacy),{state,context,nodes}=h;
  const panel=nodes.get('route-regeneration-notice'),status=nodes.get('route-regeneration-status'),button=nodes.get('regenerate-after-evidence');
  assert.equal(h.placements,legacy?1:0,'cached preview HTML gets the same inline notice');
  const alreadyKnownAbove=cell('known-above',250);context.knownCacheCells.push(cell('original',100),alreadyKnownAbove);h.freeze();h.render();
  alreadyKnownAbove.estimate_ppsqft=125;h.render();assert.equal(panel.hidden,true,'a revised value for an already known cell is not an unknown-to-known transition');
  assert.equal(panel.hidden,true,'known cells already used for this batch cause no advisory');
  context.knownCacheCells.push(cell('equal',200),cell('above',250),cell('unknown',null),cell('far-away',100,33,-97));h.render();
  assert.equal(panel.hidden,true,'equal/above-cutoff, unknown and out-of-area evidence do not trigger it');
  const shared=cell('new-low',150);state.routes[0].cells.push(shared);
  state.routes.push({cells:[{...shared}]});state.map_cell_evidence.push({...shared});context.knownCacheCells.push({...shared});
  const originalRoutes=state.routes;state.busy=true;h.render();
  assert.equal(panel.hidden,false);assert.match(status.textContent,/1 newly known AVM cell is below/);
  assert.equal(context.newRouteExclusionEvidenceCount(),1,'shared route memberships count once');
  assert.equal(button.disabled,true,'an unfinished or partially failed evidence round cannot start regeneration');
  state.busy=false;h.render();assert.equal(button.disabled,false);
  h.ready=false;h.render();assert.equal(button.disabled,true,'both reviewed gate sets must still be ready');
  h.ready=true;h.render();assert.equal(state.routes,originalRoutes,'showing the notice preserves the candidate pool');
  assert.equal(h.generations,0,'no automatic generation or approval');
  button.listeners.get('click')();assert.equal(h.generations,1,'one click uses the existing fresh-generation action');
  assert.equal(context.document.activeElement,h.active);
  h.freeze();h.render();assert.equal(panel.hidden,true,'a fresh batch includes this evidence and clears the advisory');
  state.map_cell_evidence.push(cell('next-round',175));h.render();assert.equal(panel.hidden,false);
  const saved=JSON.parse(JSON.stringify(state.routeExclusionEvidence));state.routeExclusionEvidence=context.routeExclusionEvidenceSnapshot(saved);h.render();
  assert.equal(panel.hidden,false,'saved baseline retains later evidence across session restoration');
  h.cutoff=100;h.render();assert.equal(panel.hidden,true,'another cutoff does not mislabel old evidence as newly known');
  h.cutoff=200;state.routes=[];h.render();assert.equal(panel.hidden,true,'discarded/empty candidate sets need no regeneration notice');
  assert.equal(context.routeExclusionEvidenceSnapshot({cutoff_ppsqft:200,known_cell_keys:[null]}),null);
}
// Exercise the real evidence-round merge, including a value shared by routes.
const round=harness();
round.state.routes=[{id:'route-a',cells:[cell('round-cell',null)]},{id:'route-b',cells:[cell('round-cell',null)]}];
round.freeze();round.render();assert.equal(round.nodes.get('route-regeneration-notice').hidden,true);
const merge=source.match(/function applyPoolEstimate\([^\n]*\n\}/)?.[0];assert.ok(merge);
vm.runInContext(oneLine('newKnownCellQualifiesForExclusionZone')+'\n'+merge,round.context);
const plan={plan_id:'offline-round'};
assert.equal(round.context.applyPoolEstimate({...cell('round-cell',null),members:[{route_id:'route-a'},{route_id:'route-b'}]},{estimate_ppsqft:150,source_kind:'shared_cache'},plan),true);
assert.equal(plan.red_zone_recompute_needed,true);
round.render();assert.equal(round.context.newRouteExclusionEvidenceCount(),1);
assert.equal(round.nodes.get('route-regeneration-notice').hidden,false,'a real Round 1 merge exposes the regeneration notice');
console.log('Route regeneration notice passed: strict trip-area cutoff, shared-cell deduplication, preserved candidates, explicit fresh-batch action, busy locks, saved baselines, and cached-preview markup. No provider calls.');
