import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
assert.match(source,/batch\.status='prepared_not_authorized_or_sent';const gateResolution=/,'newly prepared batches must carry an explicit status');
const nodes=new Map();
const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,value:0,max:1,setAttribute(){},addEventListener(){}});return nodes.get(id);};
const timers=[];
const context={document:{getElementById:get,addEventListener(){}},setTimeout:callback=>{timers.push(callback);return timers.length;},clearTimeout:()=>{}};
context.window=context;
vm.createContext(context);
vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),context);
const state=vm.runInContext('state',context);
let sends=0;
vm.runInContext('updateNextAction=()=>{};sendHere=()=>{globalThis.sends++;}',context);
context.sends=0;
state.providerStatus.valhalla_ready=true;
const makeDraft=()=>({here:{status:'shotgun_batch_prepared_not_authorized_or_sent'},shotgun:{batch:{requests:[{status:'prepared_not_authorized_or_sent'}]}}});

state.draft=makeDraft();
vm.runInContext('scheduleAutoHereSend()',context);
assert.equal(state.draft.shotgun.batch.status,'prepared_not_authorized_or_sent','a legacy prepared batch is normalized');
assert.equal(timers.length,1);
assert.match(get('send-here').textContent,/Starting automatically/);
timers.shift()();
assert.equal(context.sends,1,'the delayed start must invoke the route search');

state.draft=makeDraft();
vm.runInContext('scheduleAutoHereSend()',context);
state.busy=true;
timers.shift()();
assert.equal(context.sends,1,'a concurrent operation must prevent submission');
assert.equal(get('send-here').disabled,false,'the user gets a manual start after the concurrent operation');
assert.match(get('here-result').textContent,/Another operation was active/);
state.busy=false;

state.draft=makeDraft();
state.draft.shotgun.batch.status='stopped_unknown';
vm.runInContext('scheduleAutoHereSend()',context);
assert.equal(timers.length,0,'a stopped batch must never auto-start');
assert.equal(context.sends,1);
console.log('Passed Valhalla auto-start for legacy prepared batches, busy fallback, and stopped batches. External provider calls: 0.');
