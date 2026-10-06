import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const nodes=new Map();
const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,setAttribute(){},addEventListener(){},replaceChildren(){}});return nodes.get(id);};
const context={document:{getElementById:get,activeElement:null,addEventListener(){}},crypto:{randomUUID:()=> 'fixture-id'}};
context.window=context;vm.createContext(context);
for(const file of ['dist/valhalla-decoder.js','dist/shotgun-gates.js'])vm.runInContext(readFileSync(file,'utf8'),context);
vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),context);
const state=vm.runInContext('state',context);

function encode(points){let previous=[0,0],result='';for(const p of points){const now=[Math.round(p[1]*1e6),Math.round(p[0]*1e6)];for(let i=0;i<2;i++){let value=now[i]-previous[i];value=value<0?~(value<<1):value<<1;while(value>=32){result+=String.fromCharCode((32|(value&31))+63);value>>=5;}result+=String.fromCharCode(value+63);}previous=now;}return result;}
const leg=(time,offset=0)=>({shape:encode([[-97+offset,32],[-96.99+offset,32.01]]),summary:{time,length:2},maneuvers:[]});
const response=(times,offset=0)=>({trip:{legs:times.map(t=>leg(t,offset))}});
const convert=context.SurviveValhalla.convertRoutes;
const mixed={...response([7200.001]),alternates:[response([3600,3600],.1),response([600],.2)]};
const accepted=convert(mixed,'boundary',{maximumDurationSeconds:7200});
assert.deepEqual(Array.from(accepted,r=>r.route_number),[2,3],'the exact boundary qualifies and surviving alternatives keep their original numbering');
assert.equal(accepted[0].duration_s,7200,'all legs contribute to the limit');
assert.equal(accepted.raw_count,3);assert.equal(accepted.discarded_duration_count,1);
assert.equal(convert(response([473.8*60]),'detour',{maximumDurationSeconds:7200}).length,0);
assert.equal(convert({trip:{legs:[{shape:'invalid',summary:{time:8000}}]}},'early',{maximumDurationSeconds:7200}).length,0,'long detours are rejected before geometry decoding');
assert.throws(()=>convert(response([-1]),'invalid',{maximumDurationSeconds:7200}),/duration/);
assert.throws(()=>convert({trip:{legs:[{summary:{}}]}},'missing',{maximumDurationSeconds:7200}),/duration/);
assert.equal(vm.runInContext('routeWithinTimeLimit({duration_s:null})',context),false);

let providerRequests=0,rankingStarts=0,selected=0;
context.mockFetch=async()=>{providerRequests++;return{ok:true,status:200};};
context.mockResponse=mixed;
context.recordRanking=()=>rankingStarts++;
context.recordSelection=()=>selected++;
vm.runInContext(`
  providerPreflight=async()=>{};providerFetch=mockFetch;
  appJson=async()=>({provider_attempted:true,received_at:'fixture',response:mockResponse});
  cancelMapPick=()=>{};renderMapPickControls=()=>{};workflowPhase=()=>{};beginWorking=()=>()=>{};providerCounts=()=>{};log=()=>{};notice=()=>{};updateNextAction=()=>{};
  invalidatePoolPlan=()=>{};closeSelectedRoutePopup=()=>{};renderCandidates=()=>{};renderCells=()=>{};renderChoice=()=>{};renderEvaluationFlow=()=>{};renderPoolScreening=()=>{};drawMap=()=>{};
  selectRoute=recordSelection;applyInitialRedThresholdForReturnedRoutes=()=>{};resetRankingModeForNewCandidates=()=>{};setStage=()=>{};schedulePoolReviewPreparation=recordRanking;
`,context);
state.providerStatus={valhalla_ready:true,local_valhalla_ready:true};
const makeDraft=()=>({round:1,candidate_policy:{maximum_route_minutes:120},here:{},shotgun:{batch:{status:'prepared_not_authorized_or_sent',maximum_requests:2,start_gate_count:1,destination_gate_count:0,requests:[0,1].map(index=>({index,request_kind:index?'gate_pair':'baseline',round_id:'request-'+index,status:'prepared_not_authorized_or_sent',params:{},pair_number:index,start_gate:index?{id:'gate',gate_number:1,name:'Fixture'}:null}))}}});
let draft=makeDraft();state.draft=draft;
vm.runInContext('maximumRouteMinutes=5',context); // The prepared 120-minute limit is frozen.
await context.sendShotgun(draft);
assert.equal(state.routes.length,2,'distinct surviving routes are deduplicated across both gate requests');
assert(state.routes.every(r=>r.duration_s<=7200));
assert.equal(draft.shotgun.batch.returned_candidate_count,6);assert.equal(draft.shotgun.batch.discarded_duration_count,2);
assert.equal(rankingStarts,1);assert.equal(selected,1);assert.equal(state.providerCalls.RentCast,0);

context.mockResponse=response([473.8*60]);draft=makeDraft();state.draft=draft;
await context.sendShotgun(draft);
assert.equal(state.routes.length,0,'an empty accepted set removes the previous candidate batch');
assert.equal(state.poolScreening.enabled_route_ids.length,0);assert.equal(state.poolScreening.results.length,0);
assert.equal(state.noRoutesFound,true);assert.equal(rankingStarts,1,'an empty set never starts evaluation');
assert.match(get('here-result').textContent,/No routes found within your time limit and exclusion limit\./);
assert.equal(draft.shotgun.batch.discarded_duration_count,2);assert.equal(state.providerCalls.RentCast,0);assert.equal(providerRequests,4,'no retry or fallback route request is sent');

// A stopped/unknown batch is not presented as a confirmed empty search.
context.mockFetch=async()=>{throw Error('Unknown submission');};vm.runInContext('providerFetch=mockFetch',context);
draft=makeDraft();state.draft=draft;state.routes=[{id:'prior',duration_s:600}];state.noRoutesFound=false;
await context.sendShotgun(draft);
assert.equal(state.routes[0].id,'prior');assert.equal(state.noRoutesFound,false);assert.equal(draft.shotgun.batch.status,'stopped_unknown');

vm.runInContext('gateResolutionReady=()=>false;routeConditioningLocked=()=>false;',context);
assert(context.restoreTripSetup({trip_setup:{origin:'32,-97',destination:'33,-96',maximum_route_minutes:45}}));
const exported=context.buildSessionExport();
assert.equal(exported.settings.maximum_route_minutes,45);assert.equal(exported.trip_setup.maximum_route_minutes,45);
assert.throws(()=>context.restoreTripSetup({trip_setup:{maximum_route_minutes:0}}),/maximum route time/);
let discardedBatches=0;context.recordDiscard=()=>{discardedBatches++;return true;};
vm.runInContext('discardCandidatesForFreshRouteGeneration=recordDiscard',context);
assert(context.confirmMaximumRouteMinutes(60));assert.equal(discardedBatches,1);
vm.runInContext('routeConditioningLocked=()=>true',context);
assert.equal(context.confirmMaximumRouteMinutes(90),false);assert.equal(discardedBatches,1);
assert.equal(context.buildSessionExport().settings.maximum_route_minutes,60,'active route/evidence work keeps its frozen limit');
console.log('Route time limits passed: exact boundary, multi-leg alternatives, early detour rejection, mixed/empty/unknown batches, no AVM evaluation of discarded routes, session settings, and busy locks. Live provider calls: 0.');
