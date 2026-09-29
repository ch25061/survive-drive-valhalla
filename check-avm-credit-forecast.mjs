import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const html=readFileSync('dist/index.html','utf8');
assert.match(html,/id="avm-credit-forecast"/);
const nodes=new Map();
const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',addEventListener(){}});return nodes.get(id);};
const context={document:{getElementById:get,addEventListener(){}}};
context.window=context;
vm.createContext(context);
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
assert.match(get('avm-credit-forecast').textContent,/up to 2 new RentCast lookup attempts/);
state.poolScreening.plan={purpose:'automatic_route_evolution',maximum_attempts:5,round_schedule:[{maximum_attempts:2}]};
vm.runInContext('renderAvmCreditForecast()',context);
assert.match(get('avm-credit-forecast').textContent,/up to 5 new RentCast lookup attempts over three rounds/);
assert.match(get('avm-credit-forecast').textContent,/first round can make up to 2/);
state.poolScreening.plan={purpose:'automatic_route_evolution',maximum_attempts:3,round_schedule:[{maximum_attempts:6}]};
vm.runInContext('renderAvmCreditForecast()',context);
assert.match(get('avm-credit-forecast').textContent,/first round can make up to 3\./,'shared cells cannot make the first-round ceiling exceed the cycle ceiling');

state.poolScreening.cache_review=null;
vm.runInContext('renderAvmCreditForecast()',context);
assert.doesNotMatch(get('avm-credit-forecast').textContent,/up to 5/,'a stale plan is not advertised before a completed cache check');
console.log('AVM lookup forecast checks passed');
