import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const html=readFileSync('dist/index.html','utf8');
assert.match(html,/id="avm-credit-forecast"/);
assert.match(html,/id="manual-round-cost"/);
assert.match(html,/id="pool-ranking-round-cost"/);
assert.match(html,/id="automatic-cycle-cost"/);
const nodes=new Map();
const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',addEventListener(){}});return nodes.get(id);};
const context={document:{getElementById:get,addEventListener(){}}};
context.window=context;
vm.createContext(context);
vm.runInContext(readFileSync('dist/pool-screening.js','utf8'),context);
vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),context);
const state=vm.runInContext('state',context);
const cell=(id,lat,known,distance=100)=>({cell_id:id,latitude:lat,longitude:-87,estimate_ppsqft:known,outside_here_distance_m:distance});
state.routes=[
  {id:'a',cells:[cell('shared',41,300),cell('new',42,null),cell('highway',43,null,0)]},
  {id:'b',cells:[cell('shared',41,300),cell('new',42,null),cell('other',44,null)]}
];
const coverage=vm.runInContext('avmCreditCoverage(state.routes)',context);
assert.equal(coverage.total,3,'shared cells count once and highways are excluded');
assert.equal(coverage.known,1,'a shared cell with values on both routes counts once');
assert.equal(coverage.missing,2);
assert.equal(coverage.percent,100/3);
state.routes[1].cells[0].estimate_ppsqft=null;
assert.equal(vm.runInContext('avmCreditCoverage(state.routes).known',context),0,'partial route evidence is not counted as a fully known shared cell');
state.routes[1].cells[0].estimate_ppsqft=300;

state.poolScreening.cache_review={checked:3,hits:1};
vm.runInContext('renderAvmCreditForecast()',context);
assert.match(get('avm-credit-forecast').textContent,/1 of 3 unique eligible non-highway cells/);
assert.match(get('avm-credit-forecast').textContent,/reused 1 of 3/);
assert.match(get('avm-credit-forecast').textContent,/prepare an exact next-round lookup ceiling/);

state.poolScreening.plan={purpose:'candidate_pool_quota',maximum_attempts:2};
vm.runInContext('renderAvmCreditForecast()',context);
assert.match(get('avm-credit-forecast').textContent,/2 exact selected RentCast lookup attempts/);
assert.match(get('avm-credit-forecast').textContent,/up to 2 credits \(\$0\.02\)/);
state.poolScreening.plan={purpose:'automatic_route_evolution',maximum_attempts:5,round_schedule:[{maximum_attempts:2}]};
vm.runInContext('renderAvmCreditForecast()',context);
assert.match(get('avm-credit-forecast').textContent,/up to 5 new RentCast lookup attempts = up to 5 credits \(\$0\.05\) over three rounds/);
assert.match(get('avm-credit-forecast').textContent,/first round can make up to 2/);
state.poolScreening.plan={purpose:'automatic_route_evolution',maximum_attempts:3,round_schedule:[{maximum_attempts:6}]};
vm.runInContext('renderAvmCreditForecast()',context);
assert.match(get('avm-credit-forecast').textContent,/first round can make up to 3\./,'shared cells cannot make the first-round ceiling exceed the cycle ceiling');

state.poolScreening.cache_review=null;
vm.runInContext('renderAvmCreditForecast()',context);
assert.doesNotMatch(get('avm-credit-forecast').textContent,/up to 5/,'a stale plan is not advertised before a completed cache check');

const preview=vm.runInContext("manualRoundLookupPreview(state.routes,['a','b'],1,new Set())",context);
assert.equal(preview.ceiling,2,'the preliminary ceiling accounts for both included routes and unique unknown cells');
assert.equal(vm.runInContext("manualRoundLookupPreview(state.routes,['a'],1,new Set()).ceiling",context),1,'excluded routes do not add lookup cost');
state.routes[1].cells[2].outside_here_distance_m=0;
assert.equal(vm.runInContext("manualRoundLookupPreview(state.routes,['a','b'],1,new Set()).ceiling",context),1,'one shared eligible cell costs at most one lookup');
assert.equal(vm.runInContext("manualRoundLookupPreview(state.routes,['a','b'],1,new Set(['new'])).ceiling",context),0,'a previously attempted shared cell adds no new lookup cost');
assert.equal(vm.runInContext('avmLookupCreditCost(125)',context),'125 credits ($1.25)');
state.routes[1].cells[2].outside_here_distance_m=100;
state.poolScreening.results=[{route_id:'a'},{route_id:'b'}];
state.poolScreening.enabled_route_ids=['a','b'];
state.poolScreening.plan=null;
get('pool-screening-budget').value='1';
vm.runInContext('renderManualRoundCost()',context);
for(const id of ['manual-round-cost','pool-ranking-round-cost'])assert.match(get(id).textContent,/Next One Round estimate: Up to 2 new RentCast lookups/);
for(const id of ['manual-round-cost','pool-ranking-round-cost'])assert.match(get(id).textContent,/up to 2 credits \(\$0\.02\).*cached cells use none/);
assert.match(get('prepare-pool-evolution-ranking').textContent,/Calculate exact One Round lookups/,'the preliminary action cannot launch a paid round');
state.poolScreening.enabled_route_ids=['a'];
vm.runInContext('renderManualRoundCost()',context);
assert.match(get('manual-round-cost').textContent,/Up to 1 new RentCast lookup.*1 credit \(\$0\.01\)/,'deselecting a route lowers the Manual ceiling');
state.poolScreening.enabled_route_ids=['a','b'];
vm.runInContext('renderManualRoundCost()',context);
assert.match(get('manual-round-cost').textContent,/Up to 2 new RentCast lookups.*2 credits \(\$0\.02\)/,'reselecting a route raises the Manual ceiling');
state.poolScreening.plan={purpose:'candidate_pool_quota',selection_policy:{mode:'additional_known_anchor_gap_round'},maximum_attempts:1,attempt_records:[]};
state.poolScreening.status='prepared';
vm.runInContext('renderManualRoundCost()',context);
assert.match(get('pool-ranking-round-cost').textContent,/One Round exact selected count: 1 new RentCast lookup/);
assert.match(get('pool-ranking-round-cost').textContent,/maximum 1 credit \(\$0\.01\)/);
assert.match(get('prepare-pool-evolution-ranking').textContent,/Run one Manual round \(1 exact selected lookup\)/);
state.poolScreening.last_plan={...state.poolScreening.plan,attempt_records:[{provider_attempted:true}]};
state.poolScreening.plan=null;
state.poolScreening.status='complete';
vm.runInContext('renderManualRoundCost()',context);
assert.match(get('pool-ranking-round-cost').textContent,/Last One Round: ceiling 1, actual 1 new RentCast lookup/);
assert.match(get('pool-ranking-round-cost').textContent,/actual 1 new RentCast lookup = 1 credit \(\$0\.01\)/);
const autoRoutes=[
  {id:'a',cells:[cell('a1',40,null),cell('a2',40.1,null)]},
  {id:'b',cells:[cell('b1',41,null),cell('b2',41.1,null)]},
  {id:'c',cells:[cell('c1',42,null),cell('c2',42.1,null)]}
];
state.routes=autoRoutes;state.poolScreening.results=autoRoutes.map(route=>({route_id:route.id}));state.poolScreening.plan=null;state.poolScreening.cull_round=1;
state.poolScreening.enabled_route_ids=['a','b','c'];
vm.runInContext('renderAutomaticCycleCost()',context);
const allSelected=get('automatic-cycle-cost').textContent;
assert.match(allSelected,/Current selection: 3 INCLUDED routes\. First round up to 3 new lookups \(3 credits \(\$0\.03\)\)/);
state.poolScreening.enabled_route_ids=['a','c'];
vm.runInContext('renderAutomaticCycleCost()',context);
assert.match(get('automatic-cycle-cost').textContent,/Current selection: 2 INCLUDED routes\. First round up to 2 new lookups \(2 credits \(\$0\.02\)\)/,'Automatic deselection changes first-round cost');
assert.notEqual(get('automatic-cycle-cost').textContent,allSelected,'Automatic cost refreshes after deselection');
state.poolScreening.enabled_route_ids=['a','b','c'];
vm.runInContext('renderAutomaticCycleCost()',context);
assert.equal(get('automatic-cycle-cost').textContent,allSelected,'Automatic reselection restores the cost ceiling');
get('manual-route-mode').checked=true;get('pool-screening-budget').value='1';state.redThresholdConfirmed=true;
state.poolScreening.status='complete';state.poolScreening.mode='evolution';state.poolScreening.budget=1;
vm.runInContext('preparePoolEvolution=async()=>{window.preparationCount=(window.preparationCount||0)+1}',context);
await vm.runInContext('prepareManualRankingRound()',context);
assert.equal(context.preparationCount,1,'the first Manual click only prepares the exact free plan');
assert.equal(context.sentManualArgs,undefined,'preparation cannot launch paid lookups');
const reviewedPlan={plan_id:'reviewed',purpose:'candidate_pool_quota',selection_policy:{mode:'additional_known_anchor_gap_round',red_threshold_ppsqft:250,requested_per_enabled_route:1,enabled_route_ids:['a','b','c']},policy_config:{route_quota_per_enabled_route:1}};
state.poolScreening.plan=reviewedPlan;state.poolScreening.status='prepared';
assert.equal(vm.runInContext('poolQuotaPlanStillCurrent(state.poolScreening.plan)',context),true);
vm.runInContext('sendPoolScreening=async(...args)=>{window.sentManualArgs=args}',context);
await vm.runInContext('prepareManualRankingRound()',context);
assert.equal(context.sentManualArgs[0],'reviewed','the second Manual click launches the exact reviewed plan');
assert.equal(reviewedPlan.user_approval_started,true);
state.poolScreening.enabled_route_ids=['a','c'];
assert.equal(vm.runInContext('poolQuotaPlanStillCurrent(state.poolScreening.plan)',context),false,'Manual deselection invalidates the reviewed lookup count');
console.log('AVM lookup forecast checks passed');
