import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
function harness(){
  const nodes=new Map(),timers=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:true,hidden:false,disabled:false,textContent:'',listeners:{},classList:{add(){},remove(){},toggle(){}},style:{},replaceChildren(){},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(id);};
  const context={document:{getElementById:get,querySelectorAll:()=>[],addEventListener(){}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},console};context.window=context;vm.createContext(context);
  vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),context);
  const state=vm.runInContext('state',context);
  context.sends=0;context.prepared=0;context.removed=[];context.viewChanges=0;
  // Only presentation and external services are mocked; reset, gate readiness,
  // cancellation, input listeners, draft preparation and map cleanup are real.
  vm.runInContext(`
    notice=()=>{};log=message=>state.history.push(message);updateNextAction=()=>{};
    renderCandidates=()=>{};renderMetrics=()=>{};renderCells=()=>{};renderChoice=()=>{};
    renderEvaluationFlow=()=>{};renderPoolScreening=()=>{};renderRankingMode=()=>{};
    renderFreshRouteCandidatesButton=()=>{};renderValhallaBatchProgress=()=>{};
    renderMapPickControls=()=>{};renderRouteRegenerationNotice=()=>{};renderKnownAvmCellControl=()=>{};
    drawKnownAvmLayer=()=>{};drawRedExclusionZoneLayer=()=>{};drawTripMarkers=()=>{};
    drawMapEvidence=()=>{};drawShotgunGates=()=>{};scheduleMapLayoutRefresh=()=>{};
    scheduleKnownCacheRefresh=()=>{};closeRouteCellHover=()=>{};updateStreetView=()=>{};
    L={};map={removeLayer:layer=>removed.push(layer),fitBounds:()=>viewChanges++,setView:()=>viewChanges++};
    routeLayer={id:'old-route'};cellLayer={id:'old-cells'};honeycombLayer={id:'old-honeycomb'};
    inspectionMarker={id:'old-inspection'};mapRoute={id:'old-route'};sendHere=()=>{sends++;};
  `,context);
  get('origin').value='42,-88';get('destination').value='41,-87';get('red-cutoff').value='200';
  get('shotgun-inner').value='4';get('shotgun-outer').value='5';get('shotgun-spacing').value='.75';get('shotgun-count').value='6';
  return{context,state,get,timers};
}
function readyGates(h){for(const side of ['start','destination']){const gates=Array.from({length:6},(_,i)=>({id:side+'-'+i,selected:true}));h.state[side==='start'?'shotgunSuggestions':'destinationShotgunSuggestions']={maximum:6,gates};}}
function oldTrip(h){
  readyGates(h);h.state.stage='evaluate';
  h.state.routes=[{id:'old-route',cells:[{cell_id:'known',latitude:42,longitude:-88,polygon:[[-88,42],[-87,42],[-87,43],[-88,42]],estimate_ppsqft:175}],geometry:[[-88,42],[-87,41]]}];
  h.state.draft={here:{status:'shotgun_batch_complete'},shotgun:{batch:{status:'completed',requests:[]}}};
  Object.assign(h.state.poolScreening,{results:[{route_id:'old-route'}],enabled_route_ids:['old-route'],plan:{plan_id:'old-approval'},round_zero:{quota:1},round_zero_target_included:1,cull_round:3,cull_fractions:[.35,.35,.35],generation:4});
  h.state.choice={candidate_id:'old-route'};h.state.cell='known';h.state.inspection=[42,-88];h.state.avmPlan={plan_id:'old-avm'};
  h.state.providerCalls.RentCast=5;h.state.map_cell_evidence=[{cell_id:'manual-evidence',estimate_ppsqft:450}];
  h.get('route-ranking-progress').textContent='Manual round 3 still running';
}
for(const mode of ['map-start','map-destination','coordinates','address']){
  const h=harness();oldTrip(h);h.context.setStage('prepare');h.context.bindTripPointControls();
  const epoch=vm.runInContext('gateGenerationEpoch',h.context),catalogEpoch=h.state.catalogFaultEpochs.start;
  if(mode==='map-start')assert(h.context.setTripPoint('origin',[41.9,-88.1]));
  if(mode==='map-destination')assert(h.context.setTripPoint('destination',[41.7,-87.8]));
  if(mode==='coordinates'){h.get('origin').value='41.9,-88.1';h.get('origin').listeners.input();}
  if(mode==='address'){h.get('origin-address').value='A different start';h.get('origin-address').listeners.input();assert.equal(h.get('origin').value,'');}
  assert.equal(h.state.routes.length,0,mode+' discards old candidates');
  assert.equal(h.state.choice,null);assert.equal(h.state.avmPlan,null);assert.equal(h.state.inspection,null);
  assert.equal(h.state.poolScreening.plan,null);assert.equal(h.state.poolScreening.results.length,0);assert.equal(h.state.poolScreening.round_zero,null);assert.equal(h.state.poolScreening.cull_round,0);
  assert.equal(h.state.shotgunSuggestions,null);assert.equal(h.state.destinationShotgunSuggestions,null);
  assert(vm.runInContext('gateGenerationEpoch',h.context)>epoch);assert(h.state.catalogFaultEpochs.start>catalogEpoch);
  assert.equal(h.get('route-ranking-progress').textContent,'');assert.equal(h.get('route-ranking-progress').hidden,true);
  assert.equal(h.state.providerCalls.RentCast,5);assert.equal(h.state.map_cell_evidence.length,1);
  assert.equal(h.context.allKnownAvmCells().find(c=>c.cell_id==='known').estimate_ppsqft,175,'old route AVM evidence remains visible without the old route');
  assert(h.context.removed.some(layer=>layer.id==='old-route'),'actual map cleanup removes the previous route layer');assert(h.context.removed.some(layer=>layer.id==='old-inspection'));assert.equal(h.context.viewChanges,0,'trip reset preserves the map view');
  assert.equal(h.state.draft.here.status,'superseded_trip_changed');assert.equal(h.get('send-here').disabled,true);
  readyGates(h);h.context.refreshShotgunBatchReadiness();await Promise.resolve();assert.equal(h.state.stage,'prepare');assert.equal(h.context.sends,0,'new gate readiness does not bypass setup review');
}
{
  const h=harness();oldTrip(h);h.context.setStage('prepare');
  h.state.draft.here.status='shotgun_batch_prepared_not_authorized_or_sent';h.state.draft.shotgun.batch.status='prepared_not_authorized_or_sent';h.state.providerStatus.valhalla_ready=true;
  vm.runInContext('routeSetupReviewRequired=false',h.context);h.context.scheduleAutoHereSend();const send=h.timers.at(-1);
  h.context.setTripPoint('origin',[41.9,-88.1]);send();assert.equal(h.context.sends,0,'an old queued send cannot route the prior endpoints');
  readyGates(h);
  h.context.refreshAllKnownAvmCellsForRouting=async()=>{};h.context.routeOptionsFromForm=()=>({highways:0,tolls:0});h.context.scheduleAutoHereSend=()=>{h.context.sends++;};
  h.context.prepareDraft=()=>{h.context.prepared++;return{trip:{origin_label:h.get('origin').value,destination_label:h.get('destination').value},exclusion_zones:{cutoff_ppsqft:h.state.exclusionZoneThresholdPpsqft,polygon_count:0,polygon_perimeter_m:0,cell_count:0},here:{status:'shotgun_batch_prepared_not_authorized_or_sent'},shotgun:{batch:{start_gate_count:6,destination_gate_count:6,maximum_requests:49,maximum_candidates:52,baseline_candidates:4,requests:[]}}};};
  assert(h.context.setExclusionZoneThreshold(150));await h.context.generateFreshRouteCandidates();
  assert.equal(h.context.prepared,1);assert.equal(h.state.stage,'search');assert.equal(h.state.draft.trip.origin_label,'41.9,-88.1');
  assert.equal(h.state.draft.exclusion_zones.cutoff_ppsqft,150);assert.equal(h.state.draft.shotgun.batch.maximum_requests,49);assert.equal(h.context.sends,1,'only explicit fresh generation releases the new batch');
}
{
  const h=harness();oldTrip(h);let finish;
  h.context.suggestShotgunGates=({side})=>{h.state.catalogResolutionPromises[side]=new Promise(resolve=>{finish=resolve;});return null;};
  const job=h.context.generateEscapeGateSets();await Promise.resolve();h.context.setTripPoint('origin',[41.9,-88.1]);finish();await job;
  assert.equal(h.state.destinationShotgunSuggestions,null,'a late prior gate job cannot continue into the destination');assert.equal(h.context.sends,0);
}
{
  const h=harness();oldTrip(h);h.context.bindTripPointControls();
  h.get('origin-name').value='Renamed start';h.get('origin-name').listeners.input();
  assert.equal(h.state.routes.length,1,'changing a label alone preserves the trip');
  h.state.poolScreening.automatic_evolution_status='between_rounds';
  assert.equal(h.context.setTripPoint('origin',[41.9,-88.1]),false,'active evidence rounds keep trip coordinates fixed');
  assert.equal(h.get('origin').value,'42,-88');
}
{
  const h=harness();h.context.stageDraft=async()=>{h.context.prepared++;};
  h.context.setTripPoint('origin',[42,-88]);h.context.setTripPoint('destination',[41,-87]);readyGates(h);h.context.refreshShotgunBatchReadiness();await Promise.resolve();
  assert.equal(h.context.prepared,1,'first trip retains the initial automatic handoff');
}
console.log('Trip reset passed: map/coordinate/address edits, old route-layer removal without viewport movement, evidence retention, cull/approval reset, stale gate/send cancellation, explicit regeneration with new endpoints and cutoff, and initial-trip handoff. Live provider calls: 0.');
