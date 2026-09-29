import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'');
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',listeners:{},setAttribute(){},addEventListener(event,handler){this.listeners[event]=handler;}});return elements.get(id);};
const pending=new Map();let nextTimer=0,submissions=0;
const context={document:{getElementById:get},setTimeout(fn){const id=++nextTimer;pending.set(id,fn);return id;},clearTimeout(id){pending.delete(id);},crypto:{randomUUID:()=>''}};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context);
vm.runInContext('updateNextAction=()=>null;sendHere=async()=>{globalThis.submissions++;}',context);
context.submissions=0;
const state=context.window.SurviveDrive.getState();
const prepared=()=>({here:{status:'shotgun_batch_prepared_not_authorized_or_sent'},shotgun:{batch:{status:'prepared_not_authorized_or_sent'}}});
const schedule=()=>vm.runInContext('scheduleAutoHereSend()',context);
const flush=()=>{const tasks=[...pending.values()];pending.clear();for(const task of tasks)task();submissions=context.submissions;};

state.draft=prepared();state.providerStatus.valhalla_ready=false;
schedule();assert.equal(pending.size,0);assert.equal(get('send-here').disabled,true);
state.providerStatus.valhalla_ready=true;
schedule();schedule();assert.equal(pending.size,1,'repeated readiness updates keep one pending start');
assert.equal(get('send-here').disabled,true,'no approval click is needed');
assert.match(get('here-result').textContent,/start automatically/);
flush();assert.equal(submissions,1);
schedule();flush();assert.equal(submissions,1,'a failed preflight cannot automatically replay the same batch');
assert.equal(get('send-here').disabled,false,'a stopped preflight retains an explicit retry');

state.draft=prepared();schedule();assert.equal(pending.size,1);
get('candidate-limit').listeners.input();assert.equal(pending.size,0);
assert.equal(state.draft.here.status,'superseded_trip_changed');flush();assert.equal(submissions,1,'editing the trip cancels the pending start');

state.draft=prepared();schedule();assert.equal(pending.size,1);
state.providerStatus.valhalla_ready=false;schedule();assert.equal(pending.size,0);
state.providerStatus.valhalla_ready=true;schedule();flush();assert.equal(submissions,2,'a new frozen batch starts after the connection returns');

state.draft=prepared();schedule();const stale=state.draft;
state.draft=prepared();flush();assert.equal(submissions,2,'a replaced batch cannot start from its old timer');
assert.notEqual(state.draft,stale);
console.log('Valhalla starts one prepared batch automatically; edits, stale batches, and disconnected service cancel the pending start. Provider calls: 0.');
