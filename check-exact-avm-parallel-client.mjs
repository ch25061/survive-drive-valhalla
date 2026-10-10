import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const queue=source.slice(source.indexOf('const EXACT_AVM_CONCURRENCY='),source.indexOf('async function sendPoolScreening('));
const releases=new Map(),sent=[],completed=[],state={uncertainAttempts:[]};let cancelled=0;
const ui={state,console,Response,Error,providerFetch:async(path,options)=>{
  const body=JSON.parse(options.body);
  if(path.endsWith('/cancel')){cancelled++;return Response.json({revoked:true});}
  sent.push(body.attempt_index);
  return new Promise(resolve=>releases.set(body.attempt_index,resolve));
},appJson:async response=>response.json()};
vm.createContext(ui);vm.runInContext(queue+';globalThis.run=runExactAvmRequests;',ui);
const waitFor=async check=>{for(let i=0;i<300&&!check();i++)await new Promise(r=>setTimeout(r,1));assert.ok(check(),'queue reached expected state');};
const plan={plan_id:'rolling-client',cells:Array.from({length:70},(_,i)=>({cell_id:'cell-'+i})),attempt_records:[]};
const running=ui.run(plan,{onResult({index,result,uncertain}){completed.push(index);plan.attempt_records.push({attempt_index:index,provider_attempted:result?.provider_attempted??null,status:uncertain?'outcome_unknown':'complete'});}});
await waitFor(()=>sent.length===64);
assert.equal(completed.length,0,'64 requests start before any result returns');
releases.get(31)(Response.json({provider_attempted:true,estimate_ppsqft:300}));
await waitFor(()=>sent.length===65);
assert.ok(!completed.includes(0),'one free slot refills while the oldest request is still pending');
assert.deepEqual(sent,Array.from({length:65},(_,i)=>i),'each frozen index is launched exactly once');
releases.get(2)(Response.json({provider_attempted:true,uncertain:true,error:'mock timeout'},{status:502}));
await waitFor(()=>cancelled===1);
const launchedWhenStopped=sent.length;
for(const index of sent.filter(i=>i!==2&&i!==31).reverse())releases.get(index)(Response.json({provider_attempted:true,estimate_ppsqft:400}));
const result=await running;
assert.equal(sent.length,launchedWhenStopped,'uncertainty prevents all later queued cells');
assert.equal(result.finished,sent.length,'every already-started outcome is recorded before returning');
assert.equal(result.unknown,true);assert.ok(result.stopError);
assert.equal(plan.attempt_records.length,sent.length);
assert.deepEqual(Array.from(plan.attempt_records,x=>x.attempt_index),sent,'final ledger is ordered by frozen index despite out-of-order responses');
assert.equal(new Set(sent).size,sent.length,'no replay or retry');
assert.equal(cancelled,1,'queued server work is revoked once');
console.log('Passed 64-request rolling window, immediate slot refill, out-of-order results, uncertain-stop draining, exact ledger and no retries. No live calls.');
