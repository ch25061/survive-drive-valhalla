import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const appSource=readFileSync('dist/app.js','utf8'),implementation=appSource.slice(appSource.indexOf('async function approveMapAvm(){'),appSource.indexOf('\nfunction baseValidateCandidateSet'));
assert.ok(implementation.startsWith('async function approveMapAvm()'));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function makeHarness({attemptMode='success',preflightFailure=false}={}){
  const elements=new Map(),calls=[],blocked=[];
  function element(){return{value:'',children:[],disabled:false,hidden:false,open:false,checked:false,textContent:'',className:'',listeners:{},classList:{add(){},remove(){},toggle(){}},replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},setAttribute(){},removeAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;},focus(){},click(){},scrollIntoView(){},querySelector(){return null;},matches(){return false;}};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const ui={crypto:webcrypto,TextEncoder,console,document:{activeElement:null,getElementById:get,querySelectorAll(){return[];},createElement:element,createElementNS:element,addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}}};ui.window=ui;vm.createContext(ui);
  for(const file of ['here-decoder.js','route-avm.js','shotgun-gates.js','pool-screening.js'])vm.runInContext(readFileSync('dist/'+file,'utf8'),ui);
  vm.runInContext(appSource.replace(/init\(\);\s*$/,'')+';globalThis.approve=approveMapAvm;globalThis.renderPool=renderPoolScreening;globalThis.setInquiry=value=>mapInquiry=value;',ui);
  const app=ui.SurviveDrive,state=app.getState(),cell={cell_id:'CHI1K-V1-Q+1-R+1',latitude:41.9,longitude:-87.7,outside_here_distance_m:100,estimate_ppsqft:null};
  state.busy=false;state.stage='evaluate';state.redThresholdConfirmed=true;state.routes=[{id:'r1',name:'Route 1',cells:[{...cell,estimate_ppsqft:300},{...cell,cell_id:'CHI1K-V1-Q+2-R+1',outside_here_distance_m:100,estimate_ppsqft:null}],length_m:200,duration_s:600,evaluation_ready:true}];state.active=0;
  Object.assign(state.poolScreening,{status:'complete',results:[{route_id:'r1',rank:1,known_red_share:0,coverage_pct:50,known_coverage_label:'50%',known_cell_count:1,valid_count:1,missing_count:1,weighted_mean_ppsqft:300,red_distance_m:0,possible_red_distance_m:100,unknown_distance_m:100,sample_count:0,failed_count:0,unknown_count:1,screening_status:'evidence ready'}],enabled_route_ids:['r1'],ranking_revision:1,ranking_review_pending:false,ranking_review_presented_revision:1,generation:1,cull_round:1,cull_fractions:[0.35],next_cull_percent:35,mode:'initial',automatic_evolution_status:'idle'});
  get('manual-route-mode').checked=true;get('automatic-route-pruning').checked=false;get('automatic-ranking-mode').hidden=true;get('pool-screening-budget').value='5';get('pool-ranking-budget').value='5';get('pool-ranking-cull-percent').value='35';get('avm-cap').value='5';get('red-cutoff').value='200';
  app.renderEvaluationFlow();ui.renderPool();
  const preflight=deferred(),attempt=deferred(),cache=deferred(),attemptStarted=deferred(),cacheStarted=deferred(),inquiry={cell:{...cell},route_id:'r1',route_name:'Route 1',ready:true,spent:false};
  ui.setInquiry(inquiry);ui.SUBJECT={propertyType:'Single Family'};
  ui.resetAvmReview=()=>{};ui.providerCounts=()=>{};ui.providerPreflight=async()=>{await preflight.promise;if(preflightFailure)throw Error('preflight failed');};
  ui.providerFetch=async url=>{calls.push(url);if(url.endsWith('/approve'))return{ok:true,data:{approved:true}};attemptStarted.resolve();await attempt.promise;if(attemptMode==='http_failure')return{ok:false,data:{provider_attempted:true,error:'provider 503'}};if(attemptMode==='uncertain')return{ok:true,dataError:true};return{ok:true,data:{provider_attempted:true,estimate_ppsqft:300,source_kind:'provider',acquired_at:'2026-10-02T12:00:00Z'}};};
  ui.appJson=async response=>{if(response.dataError)throw Error('attempt response unreadable');return response.data;};
  ui.integrateMapCellEvidence=()=>({affected_route_ids:['r1']});ui.loadCache=async()=>{cacheStarted.resolve();await cache.promise;};ui.beginWorking=()=>()=>{};ui.money=value=>String(value);ui.log=()=>{};ui.notice=()=>{};ui.retainBlockedPlan=(plan,status)=>blocked.push({plan,status});
  const controls=()=>Object.fromEntries(['pool-screening-budget','pool-ranking-budget','pool-ranking-cull-percent','prepare-pool-evolution-ranking','red-cutoff','confirm-red-cutoff','avm-cap','avm-sampling'].map(id=>[id,get(id).disabled]));
  return{ui,app,state,inquiry,preflight,attempt,cache,attemptStarted,cacheStarted,calls,blocked,elements,get,controls};
}

const success=makeHarness(),running=success.ui.approve();
assert.equal(success.state.busy,true);
assert.deepEqual(success.controls(),{'pool-screening-budget':true,'pool-ranking-budget':true,'pool-ranking-cull-percent':true,'prepare-pool-evolution-ranking':true,'red-cutoff':true,'confirm-red-cutoff':true,'avm-cap':true,'avm-sampling':true},'real workflow renderers disable ranking, cull, cutoff, and selected-route controls while the operation is active');
await success.ui.approve();assert.deepEqual(success.calls,[],'a repeated click while busy sends no request');success.preflight.resolve();await success.attemptStarted.promise;
assert.equal(success.state.busy,true,'controls stay locked while the exact attempt is pending');assert.ok(Object.values(success.controls()).every(Boolean));
success.attempt.resolve();await success.cacheStarted.promise;assert.equal(success.state.busy,true,'controls stay locked while the returned value is saved and integrated');assert.ok(Object.values(success.controls()).every(Boolean));success.cache.resolve();await running;
assert.equal(success.state.busy,false);assert.deepEqual(success.controls(),{'pool-screening-budget':false,'pool-ranking-budget':false,'pool-ranking-cull-percent':false,'prepare-pool-evolution-ranking':false,'red-cutoff':false,'confirm-red-cutoff':false,'avm-cap':false,'avm-sampling':false},'real workflow renderers restore previously enabled controls after success');
assert.deepEqual(success.calls,['/api/providers/avm/approve','/api/providers/avm/attempt']);

for(const options of [{preflightFailure:true},{attemptMode:'http_failure'},{attemptMode:'uncertain'}]){
  const scenario=makeHarness(options),promise=scenario.ui.approve();
  assert.ok(Object.values(scenario.controls()).every(Boolean),'controls lock during each failure path');scenario.preflight.resolve();if(!options.preflightFailure){await scenario.attemptStarted.promise;assert.ok(Object.values(scenario.controls()).every(Boolean),'controls remain locked while a failing or uncertain attempt is pending');scenario.attempt.resolve();}await promise;
  assert.equal(scenario.state.busy,false,'controls unlock after each failure path');assert.ok(Object.values(scenario.controls()).every(value=>!value),'real workflow controls are restored after failure');
  if(options.preflightFailure){assert.deepEqual(scenario.calls,[],'preflight failure makes no provider request');assert.equal(scenario.blocked.length,0);}
  else if(options.attemptMode==='http_failure'){assert.equal(scenario.state.providerCalls.RentCast,1,'confirmed HTTP/provider failure still counts its single attempted call');assert.equal(scenario.calls.length,2);assert.equal(scenario.blocked.length,0);}
  else{assert.equal(scenario.state.uncertainAttempts.length,1);assert.equal(scenario.blocked.length,1);assert.equal(scenario.blocked[0].status,'submission_outcome_unknown');assert.deepEqual(scenario.calls,['/api/providers/avm/approve','/api/providers/avm/attempt'],'uncertain submission is retained and never retried');}
  const requestCount=scenario.calls.length;await scenario.ui.approve();assert.equal(scenario.calls.length,requestCount,'the spent approval cannot be repeated after any completed failure path');
}
console.log('Map AVM locks and restores the real workflow controls after success, preflight failure, confirmed provider failure, and uncertain no-retry outcomes.');
