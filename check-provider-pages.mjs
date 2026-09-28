import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

function harness(){
  const elements=new Map(),calls=[];
  function element(){return{value:'',children:[],textContent:'',listeners:{},disabled:false,hidden:false,classList:{add(){},remove(){},toggle(){}},replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},setAttribute(){},removeAttribute(){},addEventListener(k,fn){this.listeners[k]=fn;},focus(){}};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  for(const [id,value]of Object.entries({'origin':'41.96,-87.68','destination':'41.79,-87.68','origin-name':'Start','destination-name':'End','departure-mode':'any','routing-mode':'fast','candidate-limit':'7','here-key':'mock-private-entered-key','avm-cap':'2'}))get(id).value=value;
  let mode='ok';
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  const html=()=>new Response('<!DOCTYPE html><html>Sign in</html>',{status:200,headers:{'content-type':'text/html'}});
  const ui={crypto:webcrypto,TextEncoder,document:{getElementById:get,querySelectorAll:()=>[],createElement:element,createElementNS:element},async fetch(path,options={}){
    calls.push({path,options});
    if(path==='/api/providers/status')return mode==='preflight-html'?html():json({here_server_key:true,rentcast_server_key:true});
    if(path==='/api/providers/here'){
      assert.equal(options.redirect,'error');
      if(mode==='here-html')return html();
      if(mode==='here-malformed')return new Response('broken',{status:502});
      if(mode==='here-invalid-contract')return json({});
      if(mode==='here-spent')return json({error:'Provider failed',provider_attempted:true},502);
      if(mode==='here-not-sent')return json({error:'Key missing',provider_attempted:false},428);
      throw Error('Unexpected HERE call');
    }
    if(path==='/api/honeycomb/construct'||path==='/api/honeycomb/lookup')return json({complete:true,provider_calls:0,entries:JSON.parse(options.body).cells.map(c=>({cell_id:c.cell_id,status:'constructed'}))});
    if(path==='/api/cache/lookup')return json({entries:[]});
    if(path==='/api/cache/status')return json({entry_count:0,provider_calls:0});
    if(path==='/api/providers/avm/approve'){assert.equal(options.redirect,'error');return mode==='approval-html'?html():json({});}
    if(path==='/api/providers/avm/attempt'){
      assert.equal(options.redirect,'error');
      if(mode==='attempt-html')return html();
      if(mode==='attempt-redirect')throw Error('Redirect blocked');
      if(mode==='attempt-invalid-contract')return json({estimate_ppsqft:300});
      if(mode==='attempt-spent')return json({error:'Provider failed',provider_attempted:true},502);
      return json({estimate_ppsqft:300,provider_attempted:false,source_kind:'cache',cached:true});
    }
    throw Error('Unexpected path '+path);
  }};
  ui.window=ui;vm.createContext(ui);
  for(const file of ['here-decoder.js','route-avm.js','shotgun-gates.js','app.js'])vm.runInContext(readFileSync('dist/'+file,'utf8').replace(/\ninit\(\);\s*$/,''),ui);
  const app=ui.SurviveDrive,state=app.getState();state.providerStatus={here_server_key:true,rentcast_server_key:true};state.routes=JSON.parse(readFileSync('dist/reference.json','utf8')).routes;get('red-cutoff').value='250';assert.equal(app.confirmRedThreshold(250),true);
  const start=app.coordinates(get('origin').value),destination=app.coordinates(get('destination').value);state.shotgunSuggestions={origin:start,catalog_version:'page-test-start',catalog_source:'fixture',inner_miles:1,outer_miles:3,minimum_spacing_miles:.75,gates:[{id:'s1',gate_number:1,name:'Start gate',latitude:start[0]+.02,longitude:start[1],selected:true}]};state.destinationShotgunSuggestions={origin:destination,catalog_version:'page-test-destination',catalog_source:'fixture',inner_miles:1,outer_miles:3,minimum_spacing_miles:.75,gates:[{id:'d1',gate_number:1,name:'Destination gate',latitude:destination[0]-.02,longitude:destination[1],selected:true}]};
  return{app,state,get,calls,mode(value){mode=value;}};
}

for(const mode of ['here-html','here-malformed','here-invalid-contract']){
  const h=harness(),original=JSON.stringify(h.state.routes);h.mode(mode);h.app.stageDraft();await h.app.sendHere();
  assert.equal(h.state.draft.here.status,'shotgun_batch_stopped_unknown');assert.equal(h.state.providerCalls.HERE,0);assert.equal(h.state.uncertainAttempts.length,1);assert.equal(JSON.stringify(h.state.routes),original);assert.equal(h.state.draft.shotgun.batch.requests[1].status,'prepared_not_authorized_or_sent');
  const count=h.calls.length;await h.app.sendHere();assert.equal(h.calls.length,count);assert.equal(h.get('send-here').disabled,true);
  assert.ok(!h.get('here-result').textContent.includes('Unexpected token'));assert.ok(!JSON.stringify(h.state).includes('mock-private-entered-key'));assert.match(h.get('here-result').textContent,/unknown/);
}
{
  const h=harness();h.mode('preflight-html');h.app.stageDraft();await h.app.sendHere();
  assert.equal(h.calls.filter(c=>c.path==='/api/providers/here').length,0);assert.equal(h.state.uncertainAttempts.length,0);assert.equal(h.state.draft.here.status,'shotgun_batch_prepared_not_authorized_or_sent');assert.match(h.get('here-result').textContent,/No HERE request was sent/);
}
for(const [mode,calls,status,requests]of [['here-spent',2,'shotgun_batch_spent',2],['here-not-sent',0,'shotgun_batch_prepared_not_authorized_or_sent',1]]){
  const h=harness();h.mode(mode);h.app.stageDraft();await h.app.sendHere();assert.equal(h.state.providerCalls.HERE,calls);assert.equal(h.state.uncertainAttempts.length,0);assert.equal(h.state.draft.here.status,status);assert.equal(h.calls.filter(c=>c.path==='/api/providers/here').length,requests);
}
for(const mode of ['preflight-html','approval-html','attempt-html','attempt-redirect','attempt-invalid-contract','attempt-spent','ok']){
  const h=harness(),route=h.state.routes[0];await h.app.ensureRouteCoverage(route);route.evaluation_ready=true;h.state.poolScreening.status='cache_only';h.state.poolScreening.results=h.state.routes.map((item,index)=>({route_id:item.id,rank:index+1}));for(const c of route.cells)c.estimate_ppsqft=null;await h.app.stageAvm();const plan=h.state.avmPlan;assert.equal(plan.cells.length,2);
  h.mode(mode);await h.app.sendAvm();const attempts=h.calls.filter(c=>c.path==='/api/providers/avm/attempt').length;
  assert.equal(attempts,['preflight-html','approval-html'].includes(mode)?0:['attempt-spent','ok'].includes(mode)?2:1);
  assert.equal(h.state.providerCalls.RentCast,mode==='attempt-spent'?2:0);assert.equal(h.state.uncertainAttempts.length,['attempt-html','attempt-redirect','attempt-invalid-contract'].includes(mode)?1:0);
  assert.equal(h.state.blockedPlans.length,['approval-html','attempt-html','attempt-redirect','attempt-invalid-contract'].includes(mode)?1:0);
  if(h.state.blockedPlans.length)assert.equal(h.state.blockedPlans[0].plan_id,plan.plan_id);
  const before=h.calls.length;await h.app.sendAvm();assert.equal(h.calls.length,before);
}
for(const mode of ['approval-html','attempt-html','attempt-invalid-contract','attempt-spent','ok']){
  const h=harness();await h.app.inspectMapAvm([41.9,-87.7]);assert.equal(h.app.getMapInquiry().ready,true);h.mode(mode);await h.app.approveMapAvm();
  assert.equal(h.calls.filter(c=>c.path==='/api/providers/avm/attempt').length,mode==='approval-html'?0:1);assert.equal(h.state.providerCalls.RentCast,mode==='attempt-spent'?1:0);assert.equal(h.state.uncertainAttempts.length,['attempt-html','attempt-invalid-contract'].includes(mode)?1:0);
  const before=h.calls.length;await h.app.approveMapAvm();assert.equal(h.calls.length,before);
}
console.log('Passed preflight HTML, provider HTML/malformed/redirect/contract failures, exact spent/no-send accounting, blocked-plan retention, zero replay, serial stop and cached-value reuse. Actual provider calls: 0.');
