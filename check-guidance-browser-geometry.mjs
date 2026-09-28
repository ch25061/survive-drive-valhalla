import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root=new URL('.',import.meta.url).pathname.replace(/^\//,'').replaceAll('/','\\');
const index=await readFile(join(root,'dist','index.html'),'utf8');
const reference=await readFile(join(root,'dist','reference.json'),'utf8');
const catalog=await readFile(join(root,'dist','intersection-catalog-chicago-v1.json'),'utf8');
const browserHtml=index
  .replace(/<link rel="stylesheet" href="https:\/\/unpkg\.com\/leaflet[^>]+>/,'')
  .replace(/<script src="https:\/\/unpkg\.com\/leaflet[^>]+><\/script>/,'')
  .replace('</head>',`<script>
    const browserOriginalFetch=window.fetch.bind(window);
    window.fetch=(input,options)=>{
      const url=typeof input==='string'?input:input.url;
      if(url.startsWith('/api/providers/status'))return Promise.resolve(Response.json({here_server_key:false,rentcast_server_key:false}));
      if(url.startsWith('/api/cache/status'))return Promise.resolve(Response.json({entry_count:0,provider_calls:0,oldest_acquisition:null}));
      if(url.startsWith('/api/'))return Promise.reject(new Error('Provider/cache endpoint was not intercepted: '+url));
      return browserOriginalFetch(input,options);
    };
  </script></head>`);

const server=createServer(async(req,res)=>{
  const path=new URL(req.url??'/',`http://${req.headers.host}`).pathname;
  if(path==='/browser-test.html'){res.writeHead(200,{'content-type':'text/html'});res.end(browserHtml);return;}
  if(path==='/reference.json'){res.writeHead(200,{'content-type':'application/json'});res.end(reference);return;}
  if(path==='/intersection-catalog-chicago-v1.json'){res.writeHead(200,{'content-type':'application/json'});res.end(catalog);return;}
  const name=path==='/'?'index.html':path.slice(1);
  try{const body=await readFile(join(root,'dist',name));res.writeHead(200,{'content-type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugProbe=createServer();await new Promise(resolve=>debugProbe.listen(0,'127.0.0.1',resolve));const debugPort=debugProbe.address().port;await new Promise((resolve,reject)=>debugProbe.close(error=>error?reject(error):resolve()));
const profile=join(tmpdir(),`survive-drive-guidance-${process.pid}`);
const child=spawn(chrome,[`--headless=new`,`--no-sandbox`,`--disable-gpu`,`--no-first-run`,`--no-default-browser-check`,`--user-data-dir=${profile}`,`--remote-debugging-port=${debugPort}`,`--window-size=1280,900`],{stdio:'ignore'});
let socket;
try{
  for(let attempt=0;attempt<80;attempt++){
    try{const response=await fetch(`http://127.0.0.1:${debugPort}/json/list`);if(response.ok){const page=(await response.json()).find(target=>target.type==='page'&&target.webSocketDebuggerUrl);if(page){socket=new WebSocket(page.webSocketDebuggerUrl);break;}}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(socket,'Chrome DevTools endpoint did not start');
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let sequence=0;const pending=new Map();
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(Error(message.error.message)):resolve(message.result);}});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Page.navigate',{url:`http://127.0.0.1:${port}/browser-test.html`});
  const evaluate=async(expression)=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result?.value;};
  let initialized=false,readiness=null,readinessError='';for(let attempt=0;attempt<100;attempt++){try{readiness=await evaluate(`(()=>{const s=window.SurviveDrive?.getState();return {readyState:document.readyState,hasApp:!!window.SurviveDrive,catalogLoaded:!!s?.intersectionCatalog,busy:s?.busy??null,stage:s?.stage??null};})()`);initialized=readiness.readyState==='complete'&&readiness.hasApp&&readiness.catalogLoaded&&!readiness.busy;}catch(error){readinessError=error.message;}if(initialized)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(initialized,`app initialization did not finish before the geometry setup: ${JSON.stringify({readiness,readinessError})}`);
  const setup=`(()=>{window.scrollTo(0,0);const s=window.SurviveDrive.getState();s.providerStatus={here_server_key:false,rentcast_server_key:false};s.draft={here:{status:'shotgun_batch_prepared_not_authorized_or_sent'},shotgun:{batch:{status:'shotgun_batch_prepared_not_authorized_or_sent'}}};s.routes=[];s.busy=false;document.getElementById('draft-summary').textContent=Array(40).fill('Reviewed baseline and every paired gate search are listed for this approval.').join(' ');document.getElementById('here-key').value='';document.getElementById('send-here').disabled=false;window.SurviveDrive.setStage('search');return true})()`;
  const geometry=async(width)=>{
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    await evaluate(setup);await new Promise(resolve=>setTimeout(resolve,700));
    return evaluate(`(()=>{const ids=['here-approval-panel','draft-summary','request-preview','here-key','send-here','here-result'];const visible=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {id,top:r.top,bottom:r.bottom,left:r.left,right:r.right,hidden:e.hidden,display:getComputedStyle(e).display};};const panel=document.getElementById('here-approval-panel');const p=panel.getBoundingClientRect();const pointers=[...document.querySelectorAll('.next-action-pointer')];return {width:innerWidth,height:innerHeight,scrollY,focused:document.activeElement?.id??'',panel:{top:p.top,bottom:p.bottom},items:ids.map(visible),pointer:{count:pointers.length,parentId:pointers[0]?.parentElement?.id??'',ariaHidden:pointers[0]?.getAttribute('aria-hidden')??'',...(()=>{const r=pointers[0]?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}:{}})()},next:document.getElementById('next-action-text').textContent,providerCalls:window.SurviveDrive.getState().providerCalls};})()`);
  };
  for(const width of [1280,390]){
    const missing=await geometry(width);
    if(process.env.SURVIVE_DRIVE_BROWSER_DEBUG==='1')console.error(JSON.stringify(missing));
    assert.equal(missing.focused,'','guidance must not move focus');assert.equal(missing.pointer.count,1,'key-needed path must show exactly one next-action pointer');assert.equal(missing.pointer.ariaHidden,'true','decorative pointer must be hidden from assistive technology');assert.ok(missing.pointer.width>0&&missing.pointer.height>0,'key-needed pointer must be visibly rendered');assert.match(missing.next,/Enter a HERE key/);const missingKey=missing.items.find(item=>item.id==='here-key');assert.ok(missingKey.top>=0&&missingKey.bottom<=missing.height,`${width}px HERE key input must be fully visible after guided scrolling`);
    assert.equal(missing.providerCalls.HERE,0,'scrolling must not send HERE');
    await evaluate(`document.getElementById('here-key').value='local-test-key';window.SurviveDrive.updateNextAction();true`);await new Promise(resolve=>setTimeout(resolve,500));
    const available=await evaluate(`(()=>{const ids=['here-approval-panel','draft-summary','request-preview','here-key','send-here','here-result'];const button=document.getElementById('send-here'),panel=document.getElementById('here-approval-panel'),pointers=[...document.querySelectorAll('.next-action-pointer')],pointer=pointers[0],r=pointer?.getBoundingClientRect(),b=button.getBoundingClientRect(),p=panel.getBoundingClientRect();return {focused:document.activeElement?.id??'',panelHeight:p.height,items:ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {id,top:r.top,bottom:r.bottom,hidden:e.hidden}}),next:document.getElementById('next-action-text').textContent,pointer:{count:pointers.length,parentId:pointer?.parentElement?.id??'',ariaHidden:pointer?.getAttribute('aria-hidden')??'',top:r?.top,bottom:r?.bottom,left:r?.left,right:r?.right,width:r?.width,height:r?.height,withinButton:!!r&&r.top>=b.top&&r.bottom<=b.bottom&&r.left>=b.left&&r.right<=b.right},providerCalls:window.SurviveDrive.getState().providerCalls}})()`);
    if(process.env.SURVIVE_DRIVE_BROWSER_DEBUG==='1')console.error(JSON.stringify({available}));assert.equal(available.focused,'');assert.ok(available.panelHeight>900,'the HERE panel must exceed the viewport so its old top-anchor behavior would hide the approval control');assert.equal(available.pointer.count,1,`${width}px HERE approval path must show exactly one hand`);assert.equal(available.pointer.parentId,'send-here','the hand must be directly attached to the approval button');assert.equal(available.pointer.ariaHidden,'true','the decorative hand must not pollute the accessible name');assert.ok(available.pointer.width>0&&available.pointer.height>0&&available.pointer.withinButton,'the pointing hand must stay visible inside the highlighted button without overlapping nearby controls');assert.match(available.next,/approve sending it/);const key=available.items.find(item=>item.id==='here-key'),approval=available.items.find(item=>item.id==='send-here');assert.ok(key.top>=0&&key.bottom<=900,`${width}px HERE key input must remain fully visible beside its approval action`);assert.ok(approval.top>=0&&approval.bottom<=900,`${width}px HERE approval button must be fully visible after guided scrolling`);assert.equal(available.providerCalls.HERE,0);
    const fallback=await evaluate(`(()=>{const button=document.getElementById('send-here'),hand=button.querySelector('.next-action-pointer');hand?.remove();const missing=getComputedStyle(button,'::before').content;window.SurviveDrive.updateNextAction();const restored=getComputedStyle(button,'::before').content;return {missing,restored,hands:button.querySelectorAll('.next-action-pointer').length};})()`);
    assert.match(fallback.missing,/👉/,'the enabled HERE button shows its yellow fallback when conditional guidance disappears');assert.equal(fallback.restored,'none','the fallback hides when the guided hand returns');assert.equal(fallback.hands,1,'restoring guidance leaves one hand on the button');
    const repeatedSearch=await evaluate(`(()=>{window.scrollTo(0,0);window.SurviveDrive.setStage('search');const r=document.getElementById('send-here').getBoundingClientRect();return {top:r.top,bottom:r.bottom,scrollY,providerCalls:window.SurviveDrive.getState().providerCalls};})()`);
    assert.ok(repeatedSearch.scrollY>0&&repeatedSearch.top>=0&&repeatedSearch.bottom<=900,`${width}px re-entering the Search stage must reveal the prepared HERE approval even when its cue is unchanged`);assert.equal(repeatedSearch.providerCalls.HERE,0,'returning to the approval cannot send HERE');
    const prepared=await evaluate(`(()=>{window.scrollTo(0,0);const s=window.SurviveDrive.getState(),planId='geometry-plan-${width}';s.busy=false;s.redThresholdConfirmed=true;s.poolScreening.plan={plan_id:planId,cells:[{cell_id:'test-cell'}],selection_policy:{mode:'additional_known_anchor_gap_round',generation:2,requested_per_enabled_route:5,enabled_route_count:1,selected_cells:[],route_sampling:[]}};document.getElementById('red-cutoff').value='250';const details=document.getElementById('pool-screening-plan-details'),button=document.getElementById('approve-pool-screening');details.hidden=true;details.open=false;button.disabled=false;window.SurviveDrive.setStage('evaluate');const preExpansionTop=button.getBoundingClientRect().top;details.hidden=false;details.open=true;document.getElementById('pool-screening-plan-intro').textContent=Array(90).fill('Exact reviewed cell list ready; approval authorizes only the listed cells.').join(' ');document.getElementById('pool-screening-plan').textContent=Array(90).fill('cell_id latitude longitude route_id coordinates selection policy').join('\\n');const calls=JSON.stringify(s.providerCalls),focused=document.activeElement?.id??'';window.SurviveDrive.guidedPreparedPoolApprovalScroll(button,planId);return {preExpansionTop,calls,focused};})()`);
    await new Promise(resolve=>setTimeout(resolve,2500));
    const preparedGeometry=await evaluate(`(()=>{const button=document.getElementById('approve-pool-screening'),pointer=document.querySelector('.next-action-pointer'),badge=button.querySelector('.next-action-badge'),r=button.getBoundingClientRect(),p=pointer?.getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollY,button:{top:r.top,bottom:r.bottom,left:r.left,right:r.right,highlighted:button.classList.contains('next-action-target'),disabled:button.disabled},pointer:{parentId:pointer?.parentElement?.id??'',ariaHidden:pointer?.getAttribute('aria-hidden')??'',top:p?.top,bottom:p?.bottom,left:p?.left,right:p?.right,width:p?.width,height:p?.height,withinButton:!!p&&p.top>=r.top&&p.bottom<=r.bottom&&p.left>=r.left&&p.right<=r.right},badge:badge?.textContent??'',next:document.getElementById('next-action-text').textContent,focused:document.activeElement?.id??'',providerCalls:window.SurviveDrive.getState().providerCalls};})()`);
    if(process.env.SURVIVE_DRIVE_BROWSER_DEBUG==='1')console.error(JSON.stringify({prepared,preparedGeometry}));
    assert.ok(prepared.preExpansionTop>900||prepared.preExpansionTop<0,'test expands the reviewed plan after the initial cue layout');assert.equal(prepared.focused,'');assert.deepEqual(JSON.parse(prepared.calls),preparedGeometry.providerCalls,'prepared-plan scrolling cannot change the provider ledger');assert.equal(preparedGeometry.focused,'','prepared-plan guidance must not move focus');assert.ok(preparedGeometry.button.highlighted&&!preparedGeometry.button.disabled,'the exact approval control remains the highlighted enabled action');assert.ok(preparedGeometry.button.top>=0&&preparedGeometry.button.bottom<=900,`${width}px prepared-plan approval control must be fully visible after its details expand`);assert.equal(preparedGeometry.pointer.parentId,'approve-pool-screening');assert.equal(preparedGeometry.pointer.ariaHidden,'true');assert.ok(preparedGeometry.pointer.width>0&&preparedGeometry.pointer.height>0&&preparedGeometry.pointer.withinButton,'yellow finger remains visible inside the green approval control');assert.equal(preparedGeometry.badge,'Next');assert.match(preparedGeometry.next,/approve this bounded AVM plan/);assert.equal(preparedGeometry.providerCalls.RentCast,0,'guidance cannot authorize or call RentCast');
  }
  const running=await evaluate(`(()=>{const s=window.SurviveDrive.getState(),ranking=document.getElementById('primary-ranking'),plan={plan_id:'running-geometry',cells:[{},{},{},{},{}],attempt_records:[{},{}]};s.poolScreening.plan=plan;s.poolScreening.status='running';document.getElementById('pool-ranking-review').hidden=false;window.scrollTo(0,document.body.scrollHeight);const before=ranking.getBoundingClientRect().top;window.renderPoolRankingProgress();window.guidedRunningPoolRanking(plan);return {before,heading:document.getElementById('pool-ranking-heading').textContent,providerCalls:s.providerCalls};})()`);
  await new Promise(resolve=>setTimeout(resolve,250));
  const runningVisible=await evaluate(`(()=>{const r=document.getElementById('primary-ranking').getBoundingClientRect();return {top:r.top,bottom:r.bottom,scrollY,focused:document.activeElement?.id??'',providerCalls:window.SurviveDrive.getState().providerCalls};})()`);
  assert.ok(running.before<0||running.before>900,'ranking starts outside the viewport in the running-round test');
  assert.match(running.heading,/2 of 5 cells/);
  assert.ok(runningVisible.top>=0&&runningVisible.top<100,'approved AVM round scrolls the ranking into view');
  assert.equal(runningVisible.focused,'','running-round guidance does not move focus');
  assert.deepEqual(runningVisible.providerCalls,running.providerCalls,'running-round scrolling does not make provider calls');
  console.log('Passed Chrome geometry guidance regression: approval controls and the running AVM ranking become visible without focus changes or provider calls.');
}finally{try{socket?.close();}catch{}child.kill();server.close();}
