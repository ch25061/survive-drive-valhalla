import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8'),html=readFileSync('dist/index.html','utf8');
assert(html.indexOf('id="exclusion-zone-level-group"')<html.indexOf('<section data-panel="prepare">'),'the slider lives outside stage-specific panels');
const group=html.slice(html.indexOf('<fieldset id="exclusion-zone-level-group"'),html.indexOf('</fieldset>',html.indexOf('<fieldset id="exclusion-zone-level-group"')));
assert(group.includes('id="generate-time-limited-routes"'),'fresh generation is next to the Exclusion slider');
assert.equal((html.match(/id="exclusion-zone-level"/g)??[]).length,1,'one shared slider prevents divergent settings');

function harness(){
  const nodes=new Map(),panels=[{dataset:{panel:'prepare'},hidden:true},{dataset:{panel:'evaluate'},hidden:false}],timers=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'200',checked:true,textContent:'',disabled:false,hidden:false,style:{},setAttribute(){},addEventListener(){},replaceChildren(){},classList:{toggle(){}}});return nodes.get(id);};
  const context={document:{getElementById:get,querySelectorAll:selector=>selector==='[data-panel]'?panels:[],activeElement:null,addEventListener(){}},setTimeout:callback=>{timers.push(callback);return timers.length;},clearTimeout(){}};context.window=context;vm.createContext(context);
  vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),context);
  const state=vm.runInContext('state',context),actualStageDraft=vm.runInContext('stageDraft',context);
  context.queuedStages=0;context.sent=0;context.prepared=0;context.autoStarts=0;
  vm.runInContext(`
    gateResolutionReady=()=>true;selectedShotgunGates=()=>[{id:'fixture-gate'}];renderFreshRouteCandidatesButton=()=>{};
    renderMapPickControls=()=>{};notice=()=>{};log=()=>{};scheduleMapLayoutRefresh=()=>{};updateNextAction=()=>refreshShotgunBatchReadiness();
    stageDraft=async()=>{queuedStages++;};sendHere=()=>{sent++;};
    renderRedThreshold=()=>{};drawRedExclusionZoneLayer=()=>{};discardCandidatesForFreshRouteGeneration=()=>true;
  `,context);
  return{context,state,get,panels,timers,actualStageDraft};
}

{
  const h=harness();h.state.stage='evaluate';h.context.setStage('prepare');
  assert.equal(h.panels[0].hidden,false);assert.equal(h.panels[1].hidden,true);
  for(let i=0;i<5;i++)h.context.refreshShotgunBatchReadiness();await Promise.resolve();
  assert.equal(h.context.queuedStages,0,'returning to setup and rendering ready gates does not generate routes');
  assert(h.context.setExclusionZoneThreshold(150));assert.equal(h.state.exclusionZoneThresholdPpsqft,150);assert.equal(h.context.queuedStages,0,'changing the cutoff waits for explicit generation');
}
{
  const h=harness();h.context.refreshShotgunBatchReadiness();h.state.stage='search';h.context.setStage('prepare');await Promise.resolve();
  assert.equal(h.context.queuedStages,0,'a readiness microtask queued before returning is cancelled');
}
{
  const h=harness();h.context.refreshShotgunBatchReadiness();await Promise.resolve();assert.equal(h.context.queuedStages,1,'initial completed gate setup keeps its automatic handoff');
}
{
  const h=harness();h.state.stage='search';h.state.providerStatus.valhalla_ready=true;
  h.state.draft={here:{status:'shotgun_batch_prepared_not_authorized_or_sent'},shotgun:{batch:{requests:[{status:'prepared_not_authorized_or_sent'}],status:'prepared_not_authorized_or_sent'}}};
  h.context.scheduleAutoHereSend();assert.equal(h.timers.length,1);
  h.context.setStage('prepare');h.context.scheduleAutoHereSend();h.timers[0]();
  assert.equal(h.context.sent,0,'queued sends and later connection refreshes cannot bypass setup review');
}

function configureActualPreparation(h){
  h.context.stageDraft=h.actualStageDraft;
  h.context.staticCheck=async()=>{};
  h.context.makePrepared=()=>{h.context.prepared++;return{round:1,trip:{origin_label:'Start',destination_label:'Destination'},exclusion_zones:{cutoff_ppsqft:h.state.exclusionZoneThresholdPpsqft,polygon_count:0,polygon_perimeter_m:0,cell_count:0,masked_start_destination_cell_count:0,masked_highway_cell_count:0,masked_tollway_cell_count:0,connector_cell_count:0,road_tile_count:0},here:{status:'shotgun_batch_prepared_not_authorized_or_sent'},shotgun:{batch:{start_gate_count:1,destination_gate_count:1,maximum_requests:4,maximum_candidates:4,baseline_candidates:1,requests:[]}}};};
  vm.runInContext(`refreshAllKnownAvmCellsForRouting=()=>staticCheck();routeOptionsFromForm=()=>({highways:0,tolls:0});drawMap=()=>{};prepareDraft=makePrepared;scheduleAutoHereSend=()=>{autoStarts++;};`,h.context);
}
{
  const h=harness();configureActualPreparation(h);h.state.stage='evaluate';h.context.setStage('prepare');h.context.setExclusionZoneThreshold(150);
  await vm.runInContext('generateFreshRouteCandidates()',h.context);
  assert.equal(h.context.prepared,1);assert.equal(h.state.draft.exclusion_zones.cutoff_ppsqft,150,'explicit generation freezes the lowered exclusion cutoff');
  assert.equal(h.state.stage,'search');assert.equal(h.context.autoStarts,1,'the prepared batch proceeds after the user explicitly generates it');
}
{
  const h=harness();configureActualPreparation(h);h.state.stage='evaluate';let finish;
  h.context.staticCheck=()=>new Promise(resolve=>{finish=resolve;});
  const pending=h.actualStageDraft();await Promise.resolve();h.context.setStage('prepare');finish();await pending;
  assert.equal(h.context.prepared,0);assert.equal(h.context.autoStarts,0);assert.equal(h.state.stage,'prepare','a static check finishing after a return does not pull the user into Search');
}
{
  const h=harness();configureActualPreparation(h);h.state.stage='evaluate';h.context.setStage('prepare');h.context.staticCheck=async()=>{throw Error('Static check unavailable');};
  await vm.runInContext('generateFreshRouteCandidates()',h.context);
  h.context.stageDraft=async()=>{h.context.queuedStages++;};h.context.refreshShotgunBatchReadiness();await Promise.resolve();
  assert.equal(h.context.queuedStages,0,'a failed explicit generation does not turn into an automatic retry');
}
{
  const h=harness();
  class Node{
    constructor(){this.children=[];}
    detach(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}
    append(...nodes){for(const n of nodes){n.detach();this.children.push(n);n.parentNode=this;}}
    after(node){node.detach();this.parentNode.children.splice(this.parentNode.children.indexOf(this)+1,0,node);node.parentNode=this.parentNode;}
    before(node){node.detach();this.parentNode.children.splice(this.parentNode.children.indexOf(this),0,node);node.parentNode=this.parentNode;}
  }
  const root=new Node(),time=new Node(),oldPanel=new Node(),exclusions=new Node(),button=new Node(),help=new Node();
  root.append(time,oldPanel);oldPanel.append(exclusions);time.append(button);exclusions.append(help);
  const bindings=new Map([['route-time-control',time],['exclusion-zone-level-group',exclusions],['generate-time-limited-routes',button],['exclusion-zone-level-help',help]]);
  h.context.document.getElementById=id=>bindings.get(id);h.context.document.createElement=()=>new Node();
  h.context.placeSharedExclusionControls();
  assert.equal(exclusions.parentNode,root);assert.equal(button.parentNode,exclusions);assert.equal(help.parentNode.className,'exclusion-help');
  h.context.placeSharedExclusionControls();assert.equal(exclusions.children.length,2,'legacy markup migration is repeatable and keeps existing event targets');
}
console.log('Setup review passed: shared exclusion slider, cancelled readiness microtasks and send timers, connection-refresh guard, preserved initial handoff, explicit generation with the revised cutoff, and in-flight static-check cancellation. Live provider calls: 0.');
