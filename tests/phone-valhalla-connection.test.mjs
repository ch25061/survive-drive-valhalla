import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'');
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',setAttribute(){},addEventListener(){}});return elements.get(id);};
const context={document:{getElementById:get},navigator:{userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/124'},AbortSignal,crypto:{randomUUID:()=>''}};
context.window=context;vm.createContext(context);vm.runInContext(source,context);
vm.runInContext('beginWorking=()=>()=>{};scheduleAutoHereSend=()=>{};',context);
const state=context.window.SurviveDrive.getState();
let calls=[];
context.fetch=async(path,options)=>{calls.push({path,options});return Response.json({valhalla_ready:true,rentcast_server_key:true,valhalla_configured:true});};
await vm.runInContext('loadProviders()',context);
assert.equal(state.providerStatus.valhalla_ready,true);
assert.equal(state.providerStatus.local_valhalla_ready,false);
assert.match(get('provider-status').textContent,/desktop server connected through the internet/);
assert.deepEqual(calls.map(c=>c.path),['/api/providers/status'],'Android never probes its own loopback for the desktop engine');
assert.equal(calls[0].options.cache,'no-store');
assert.equal(calls[0].options.redirect,'error');

const fault='The desktop Valhalla gateway rejected the hosted app authentication (HTTP 401). No route request was sent.';
context.fetch=async path=>{calls.push({path});return Response.json({valhalla_ready:false,rentcast_server_key:true,valhalla_configured:true,valhalla_connection_error:fault});};
await vm.runInContext('loadProviders()',context);
assert.equal(state.providerStatus.valhalla_ready,false);
assert.ok(get('provider-status').textContent.includes(fault));
assert.equal(vm.runInContext('valhallaConnectionMessage()',context),fault);

state.providerStatus.valhalla_ready=true;
context.fetch=async()=>{throw Error('network offline');};
await vm.runInContext('loadProviders()',context);
assert.equal(state.providerStatus.valhalla_ready,false,'a failed check clears stale readiness');
assert.equal(state.providerStatus.local_valhalla_ready,false);
assert.match(get('provider-status').textContent,/app connection could not complete/);
assert.match(vm.runInContext('valhallaConnectionMessage()',context),/Export your session/);
context.fetch=async()=>Response.json({valhalla_ready:'yes',rentcast_server_key:true});
await assert.rejects(vm.runInContext('providerPreflight()',context),/invalid response/);
assert.equal(state.providerStatus.valhalla_ready,false);

context.navigator.userAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64)';calls=[];
context.fetch=async path=>{calls.push({path});return Response.json(path.startsWith('http:')?{valhalla_ready:true}:{valhalla_ready:false,rentcast_server_key:true,valhalla_configured:true});};
await vm.runInContext('providerPreflight()',context);
assert.equal(state.providerStatus.local_valhalla_ready,true,'desktop browser keeps its direct engine fallback');
assert.equal(state.providerStatus.valhalla_ready,true);
assert.deepEqual(calls.map(c=>c.path),['/api/providers/status','http://127.0.0.1:8003/status']);
assert.ok(calls.every(c=>!c.path.includes('/route')));
console.log('Phone hosted connection, specific failures, stale-readiness protection, and desktop fallback passed. Live route/AVM requests: 0.');
