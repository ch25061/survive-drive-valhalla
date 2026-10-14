import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('dist/guided-mode.js','utf8');
function fixture(saved=null,storageFails=false,appearanceSaved=null){
  const nodes=new Map(),events={},microtasks=[];let requests=0,submissions=0;
  const element=id=>({id,textContent:'',hidden:false,disabled:false,checked:false,value:'',style:{values:{},setProperty(k,v){this.values[k]=String(v);},getPropertyValue(k){return this.values[k]||'';}},dataset:{},attributes:{},listeners:{},parentElement:null,localName:'button',classList:{set:new Set(),add(c){this.set.add(c);},contains(c){return this.set.has(c);},toggle(c,on){if(on)this.set.add(c);else this.set.delete(c);}},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(n,v){this.attributes[n]=v;},hasAttribute(n){return n in this.attributes;},matches(){return this.localName==='button';},querySelector(){return null;},scrollIntoView(){this.scrolled=true;},focus(){this.focused=true;},click(){submissions++;},showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();}});
  const node=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
  const state={stage:'evaluate',routes:[{id:'real-route',geometry:[[1,2],[3,4]]}],active:0,choice:{candidate_id:'real-route'},notes:{real:'keep me'},providerCalls:{RentCast:12,Valhalla:42},poolScreening:{plan:{status:'prepared',maximum_attempts:5,selected_cells:[{cell_id:'real-cell'}]},enabled_route_ids:['real-route']}};
  const target=node('paid-approval'),disabled=node('disabled');disabled.disabled=true;disabled.hidden=true;
  const routeColor=node('route-line-color-picker'),legacyRouteColor=node('route-line-color-settings'),upperColor=node('color-scale-setting'),familyParams=node('route-family-parameters'),roadPrefs=node('avoid-settings');
  const restoredControls=new Map([
    ['#trip-endpoints label:has(> #origin-name)',node('origin-name-label')],['#trip-endpoints label:has(> #destination-name)',node('destination-name-label')],
    ['#trip-endpoints label:has(> #origin)',node('origin-coordinate-label')],['#trip-endpoints label:has(> #destination)',node('destination-coordinate-label')],
    ['#trip-form > .form-pair',node('trip-form-pair')],['#trip-form > .form-pair + .hint',node('trip-form-pair-help')],
    ['#pool-ranking-baseline-control',node('pool-ranking-baseline-control')],['label:has(> #pool-ranking-cull-percent)',node('pool-ranking-cull-label')],
    ['#pool-ranking-cull-help',node('pool-ranking-cull-help')],['#pool-ranking-cull-preview',node('pool-ranking-cull-preview')],
    ['#pool-screening-route-allocation-details',node('pool-screening-route-allocation-details')],['#pool-screening-ledger-details',node('pool-screening-ledger-details')],['.round-history',node('round-history')]
  ]);
  const rawTechnical=new Map([
    ['#here-approval-panel details:has(#request-preview)',node('exact-request-settings')],['#download-request',node('download-request')],
    ['#download-response',node('download-response')],['#here-approval-panel > details:has(#paste-valhalla-request)',node('paste-valhalla-request-details')],
    ['#download-example',node('download-example')],['#pool-screening-plan-details details:has(#pool-screening-plan)',node('exact-plan-data')]
  ]);
  for(const id of ['download-request','download-response'])node(id).disabled=true;
  for(const id of ['approve-pool-screening','pool-screening-plan-details'])node(id).hidden=true;
  node('approve-pool-screening').disabled=true;
  const selectorResults=new Map([
    ['.route-line-color-picker',[routeColor]],['#route-line-color-settings',[legacyRouteColor]],['.color-scale-setting',[upperColor]],['#route-family-parameters',[familyParams]],['#avoid-settings',[roadPrefs]],
    ...[...restoredControls,...rawTechnical].map(([selector,el])=>[selector,[el]])
  ]);
  node('next-action-text').textContent='Review the exact 5 requests and approve only if you want more evidence.';
  const panel=node('experience-bar'),guideStack=node('guide-panel-stack');
  for(const id of ['mode-panel-opacity','mode-panel-color','mode-panel-text','mode-panel-opacity-value','mode-panel-color-value','mode-panel-text-value','guided-dock','guided-floating-choices'])node(id);
  let targetPresent=true;
  const doc={body:node('body'),activeElement:node('practice-launcher'),getElementById:node,querySelector(selector){if(selector==='.experience-bar')return panel;if(selector==='.guide-panel-stack')return guideStack;return targetPresent?target:null;},querySelectorAll(selector){return selector==='.guided-advanced-control'?[...nodes.values()].filter(el=>el.classList.contains('guided-advanced-control')):selectorResults.get(selector)||[];},addEventListener(name,fn){events[name]=fn;}};
  const initialEntries=saved?[['route-screwtiny.experience.v1',saved]]:[];if(appearanceSaved)initialEntries.push(['route-screwtiny.mode-panel.v1',JSON.stringify(appearanceSaved)]);const storage=new Map(initialEntries);
  const env={document:doc,SurviveDrive:{getState:()=>state},Event:class{},queueMicrotask(fn){microtasks.push(fn);},dispatchEvent(){},localStorage:{getItem(k){if(storageFails)throw Error('Unavailable');return storage.get(k);},setItem(k,v){if(storageFails)throw Error('Unavailable');storage.set(k,v);}},fetch(){requests++;throw Error('No requests permitted');}};env.window=env;
  vm.createContext(env);vm.runInContext(source,env);
  return {env,state,node,disabled,target,panel,guideStack,routeColor,legacyRouteColor,upperColor,familyParams,roadPrefs,restoredControls,rawTechnical,storage,events,flush(){while(microtasks.length)microtasks.shift()();},act(id,event='click'){node(id).listeners[event]?.({target:node(id)});},setTarget(v){targetPresent=v;},counts:()=>({requests,submissions})};
}
const f=fixture(),before=JSON.stringify(f.state);
assert.equal(f.env.RouteGuidance.getMode(),'guided');
assert.equal(f.node('mode-guided').attributes['aria-pressed'],'true');
assert.equal(f.node('mode-panel-opacity').value,'85','first-run appearance uses the brighter 85% opacity');
assert.equal(f.node('mode-panel-color').value,'180','first-run appearance uses teal');
assert.equal(f.node('mode-panel-text').value,'4','first-run appearance retains purple text');
assert.equal(f.node('mode-panel-opacity-value').textContent,'85%');assert.equal(f.node('mode-panel-color-value').textContent,'Teal');assert.equal(f.node('mode-panel-text-value').textContent,'Purple');
for(const surface of [f.guideStack,f.panel,f.node('guided-dock'),f.node('guided-floating-choices')]){assert.equal(surface.style.getPropertyValue('--mode-panel-hue'),'180');assert.equal(surface.style.getPropertyValue('--mode-panel-opacity'),'0.85');assert.equal(surface.style.getPropertyValue('--mode-panel-text'),'#4b1478','the appearance default keeps purple ink');}
for(const control of [f.routeColor,f.legacyRouteColor,f.upperColor,f.familyParams,f.roadPrefs])assert.equal(control.classList.contains('guided-advanced-control'),false,control.id+' is a display or contextual control, not operational advanced UI');
for(const [selector,control] of f.restoredControls)assert.equal(control.classList.contains('guided-advanced-control'),false,selector+' remains available in Guided Mode');
for(const [selector,control] of f.rawTechnical)assert.equal(control.classList.contains('guided-advanced-control'),true,selector+' remains under Advanced as raw technical detail');
assert.match(f.node('guided-next').textContent,/exact 5 requests/,'prepared plans use the canonical approval instruction');
for(const mode of ['super','guided','super','guided'])f.env.RouteGuidance.setMode(mode);
assert.equal(JSON.stringify(f.state),before,'switching modes preserves routes, rankings, choices, evidence plans and attempts');
assert.equal(f.disabled.disabled,true);assert.equal(f.disabled.hidden,true,'native workflow gates remain unchanged');
for(const id of ['download-request','download-response','approve-pool-screening'])assert.equal(f.node(id).disabled,true,id+' retains its native disabled/approval boundary');
for(const id of ['approve-pool-screening','pool-screening-plan-details'])assert.equal(f.node(id).hidden,true,id+' retains its native hidden state');
f.act('guided-show-next');assert.equal(f.target.focused,true);assert.deepEqual(f.counts(),{requests:0,submissions:0},'Show me focuses, never submits an approval');
f.state.busy=true;f.env.RouteGuidance.schedule();f.env.RouteGuidance.schedule();f.flush();assert.equal(f.node('guided-show-next').hidden,true);assert.match(f.node('guided-next').textContent,/progress/);
f.state.busy=false;f.state.catalogBusy={destination:true};f.env.RouteGuidance.update();assert.equal(f.node('guided-show-next').disabled,true,'Census ring work is also a wait state');
f.state.catalogBusy={};
for(const [stage,number] of [['prepare',1],['search',2],['evaluate',3],['inspect',4],['choose',5]]){f.state.stage=stage;f.env.RouteGuidance.update();assert.equal(f.node('guided-step').textContent,'STEP '+number+' OF 5');assert.equal(f.roadPrefs.classList.contains('guided-advanced-control'),false,'road preferences must not be hidden behind advanced controls');}
for(const mode of ['super','guided']){f.env.RouteGuidance.setMode(mode);for(const [selector,control] of f.restoredControls)assert.equal(control.classList.contains('guided-advanced-control'),false,selector+' stays outside Advanced in '+mode+' mode');for(const [selector,control] of f.rawTechnical)assert.equal(control.classList.contains('guided-advanced-control'),true,selector+' remains raw technical detail in '+mode+' mode');}
f.state.stage='prepare';f.node('next-action-text').textContent='Explicitly accept the limited Destination gate set, or retry.';f.env.RouteGuidance.update();assert.match(f.node('guided-next').textContent,/limited Destination/,'partial gate decisions are not replaced with a success instruction');
f.setTarget(false);f.env.RouteGuidance.update();assert.equal(f.node('guided-show-next').disabled,true,'no invented action when the canonical cue is absent');
f.node('next-action').hidden=true;f.env.RouteGuidance.update();assert.doesNotMatch(f.node('guided-next').textContent,/limited Destination/,'hidden old cues are not reused');
assert.equal(fixture('super').env.RouteGuidance.getMode(),'super','returning users retain their preference');
assert.equal(fixture(null,true).env.RouteGuidance.getMode(),'guided','blocked storage does not break the UI');
const savedAppearance=fixture('super',false,{opacity:43,hue:242,ink:4});assert.equal(savedAppearance.env.RouteGuidance.getMode(),'super');
assert.equal(savedAppearance.node('mode-panel-opacity').value,'43','a saved opacity overrides the new first-run default');assert.equal(savedAppearance.node('mode-panel-color').value,'242','a saved hue is retained');assert.equal(savedAppearance.node('mode-panel-text').value,'4','a saved ink choice is retained');
for(const mode of ['guided','super'])savedAppearance.env.RouteGuidance.setMode(mode);
assert.equal(savedAppearance.node('mode-panel-opacity').value,'43');assert.equal(savedAppearance.node('mode-panel-color').value,'242');assert.equal(savedAppearance.node('mode-panel-text').value,'4');
const realState=JSON.stringify(f.state);f.act('guided-practice');assert.equal(f.node('guided-lesson').open,true);
f.node('lesson-route-a').checked=true;f.act('lesson-route-a','change');assert.equal(f.node('lesson-overlap').hidden,true);
f.node('lesson-route-b').checked=true;f.act('lesson-route-b','change');assert.equal(f.node('lesson-overlap').hidden,false);assert.equal(f.node('lesson-purple').disabled,false);
f.act('lesson-purple');assert.match(f.node('lesson-explanation').textContent,/exact shared path/);
f.node('lesson-route-a').checked=false;f.act('lesson-route-a','change');assert.equal(f.node('lesson-overlap').hidden,true);assert.equal(f.node('lesson-unknown').disabled,false);
f.act('lesson-unknown');assert.match(f.node('lesson-status').textContent,/Practice complete/);assert.match(f.node('lesson-explanation').textContent,/remains unknown/);
f.act('lesson-close');assert.equal(f.node('practice-launcher').focused,true);
assert.equal(JSON.stringify(f.state),realState,'practice does not insert example routes or evidence into the real trip');
assert.deepEqual(f.counts(),{requests:0,submissions:0});
const html=readFileSync('dist/index.html','utf8'),build=readFileSync('build.mjs','utf8'),styles=readFileSync('dist/style.css','utf8'),appSource=readFileSync('dist/app.js','utf8');
for(const href of ['/tutorial.html','/android.html'])assert(html.includes(`href="${href}"`),`${href} help remains available from the masthead`);
assert.match(html,/<span id="provider-status">/,'live provider connection status remains in the masthead');
const hiddenMastheadFunctions=styles.split('}').filter(rule=>{const brace=rule.lastIndexOf('{');if(brace<0)return false;const selectors=rule.slice(0,brace),declarations=rule.slice(brace+1);return /display\s*:\s*none/.test(declarations)&&/(?:^|[,{}\s])(?:body\[data-experience-mode="guided"\]\s+)?\.masthead\s+\.mode\b|(?:^|[,{}\s])(?:body\[data-experience-mode="guided"\]\s+)?\.masthead\s+\.tutorial-link\b|(?:^|[,{}\s])(?:body\[data-experience-mode="guided"\]\s+)?#provider-status\b/.test(selectors);});
assert.deepEqual(hiddenMastheadFunctions,[],'mobile tutorial/Android links and live provider connection status are not CSS-hidden in Guided Mode');
const gateSettingsStart=html.indexOf('<details id="shotgun-settings">'),gateSettingsEnd=html.indexOf('</details>',gateSettingsStart),gateSettingsMarkup=html.slice(gateSettingsStart,gateSettingsEnd);
const routeActionsStart=html.indexOf('<fieldset id="route-search-actions"'),routeActionsEnd=html.indexOf('</fieldset>',routeActionsStart),routeActionsMarkup=html.slice(routeActionsStart,routeActionsEnd);
assert.match(gateSettingsMarkup,/<button id="suggest-shotgun" type="button"[^>]*disabled>GO — Generate Both Gate Sets<\/button>/,'GO remains the gate-generation action');
assert(!gateSettingsMarkup.includes('id="prepare-shotgun-batch"'),'route search submission is separate from gate generation');
assert.match(routeActionsMarkup,/<legend>Find routes using your gates<\/legend>/,'route search controls are clearly separated from gate settings');
assert.match(routeActionsMarkup,/<button id="prepare-shotgun-batch"[^>]*type="submit"[^>]*disabled>Generate routes from current gates<\/button>/,'route generation remains a disabled form submit until gates are ready');
assert.equal((html.match(/\bid="prepare-shotgun-batch"/g)||[]).length,1,'the existing route-search button ID remains unique');
assert(html.indexOf('id="shotgun-settings"')<routeActionsStart&&html.indexOf('</details>',html.indexOf('id="shotgun-settings"'))<routeActionsStart,'route search action follows, and sits outside, the gate settings disclosure');
assert.match(appSource,/\$\('trip-form'\)\.addEventListener\('submit',async e=>\{e\.preventDefault\(\);try\{await stageDraft\(\);/,'batch refresh retains the existing exact-batch submit handler');
assert.match(appSource,/const batchButton=\$\('prepare-shotgun-batch'\);batchButton\.disabled=!ready/,'route generation remains gated by current route-gate readiness');
assert.ok(appSource.includes("$('suggest-shotgun').addEventListener('click'")&&appSource.includes("scheduleEscapeGateGeneration(['start','destination']"),'gate GO generates both Census gate sets independently of route search');
assert.match(appSource,/function updateNextAction\(\)\{\s*renderGateGenerationControl\(\);/,'gate GO enabled/disabled state refreshes with the next action');
const gateGenerator=appSource.slice(appSource.indexOf('async function generateEscapeGateSets('),appSource.indexOf('\nfunction runQueuedGateGeneration',appSource.indexOf('async function generateEscapeGateSets(')));
assert(gateGenerator.includes('refreshShotgunBatchReadiness()'),'completed gate generation refreshes the separate route readiness control');
assert.doesNotMatch(gateGenerator,/\bstageDraft\(|\bsendHere\(/,'generating gates does not prepare or start a route batch');
assert.match(gateGenerator,/No route request has been sent\./,'the completed gate message confirms route search has not started');
const gateSchedule=appSource.slice(appSource.indexOf('function scheduleEscapeGateGeneration('),appSource.indexOf('\nasync function approveCatalogPageFault',appSource.indexOf('function scheduleEscapeGateGeneration(')));
assert.match(gateSchedule,/guidedExperienceActive\(\)\)\{routeSetupReviewRequired=true;[^}]*cancelAutoHereSend\(\)/,'Guided gate generation blocks automatic route-stage progression');
const batchReadiness=appSource.slice(appSource.indexOf('function refreshShotgunBatchReadiness('),appSource.indexOf('\nfunction gateRejectionSummary',appSource.indexOf('function refreshShotgunBatchReadiness(')));
assert.match(batchReadiness,/if\(ready&&state\.stage==='prepare'&&!routeSetupReviewRequired/,'automatic batch preparation remains guarded by the explicit Guided review flag');
assert.match(appSource,/function renderGateGenerationControl\(\)\{[^}]*button\.disabled=!!working\|\|!gateSettingsAndPointsValid\(\)\|\|\(!catalog&&!retry\)/,'GO is disabled while working, settings are invalid, or no catalog/retry is available');
assert.match(appSource,/const regenerated=!!state\.shotgunSuggestions\|\|!!state\.destinationShotgunSuggestions;\s*button\.textContent=regenerated\?'GO — Regenerate Both Gate Sets':'GO — Generate Both Gate Sets';/,'GO remains labeled and available for another generation after successful gate generation');
assert.match(appSource,/for\(const id of \['shotgun-inner','shotgun-outer','shotgun-spacing','shotgun-count'\]\)for\(const event of \['input','change'\]\)\$\(id\)\.addEventListener\(event,\(\)=>escapeGateInputsChanged\(\)\)/,'editing any circle setting invalidates the previous gate sets');
assert.match(appSource,/function escapeGateInputsChanged\([^]*?cancelEscapeGateGeneration\(/,'gate-setting edits cancel current generated gates before another search');
assert.match(appSource,/function cancelEscapeGateGeneration\([^]*?clearShotgunSuggestions\(/,'cancelling gate results clears both Start and Destination suggestions');
const textPullout=html.slice(html.indexOf('<aside id="guided-floating-choices"'),html.indexOf('</aside>',html.indexOf('<aside id="guided-floating-choices"')));
assert.match(gateSettingsMarkup,/<button id="show-gate-text-list"[^>]*aria-expanded="false"[^>]*aria-controls="guided-gate-text-lists">Show route gate text lists<\/button>/,'gate text lists have a discoverable, initially closed opener');
assert.match(textPullout,/<div id="guided-gate-text-lists" class="guided-gate-text-lists" hidden>/,'gate text lists live in the initially hidden shared panel');
for(const id of ['shotgun-gate-list','shotgun-gate-list-destination']){assert(textPullout.includes(`id="${id}"`),`${id} is available only in the optional pull-out`);assert.equal((html.match(new RegExp(`\\bid="${id}"`,'g'))||[]).length,1,`${id} remains unique`);assert(!gateSettingsMarkup.includes(`id="${id}"`),`${id} is not shown inline beside the map-first workflow`);}
assert.match(styles,/\.guided-gate-text-lists \.gate-option\{[^}]*hsla\(var\(--mode-panel-hue\)/,'the gate-list pull-out shares the guide appearance');
// Run the actual GO readiness renderer against normal, generated, edited, busy, catalog-missing, and retry states.
const gateUiNodes=new Map();
const gateUiNode=id=>{if(!gateUiNodes.has(id))gateUiNodes.set(id,{id,value:'',textContent:'',disabled:false,hidden:false,checked:false,attributes:{},addEventListener(){},getAttribute(name){return this.attributes[name]??null;},setAttribute(name,value){this.attributes[name]=String(value);},removeAttribute(name){delete this.attributes[name];},classList:{toggle(){},add(){},remove(){}}});return gateUiNodes.get(id);};
let gateUiProviderCalls=0;
const gateUiEnv={document:{body:{dataset:{experienceMode:'guided'}},getElementById:gateUiNode},localStorage:{getItem(){return null;}},fetch(){gateUiProviderCalls++;throw Error('readiness checks must not call providers');}};gateUiEnv.window=gateUiEnv;
const gateUiSource=appSource.replace(/\ninit\(\);\s*$/,'\nwindow.__renderGateGenerationControl=renderGateGenerationControl;');
vm.createContext(gateUiEnv);vm.runInContext(gateUiSource,gateUiEnv);
const gateUiState=gateUiEnv.SurviveDrive.getState(),renderGateGo=gateUiEnv.__renderGateGenerationControl,gateGo=gateUiNode('suggest-shotgun');
gateUiNode('origin').value='41.8, -87.8';gateUiNode('destination').value='41.9, -87.7';gateUiNode('shotgun-inner').value='4';gateUiNode('shotgun-outer').value='5';gateUiNode('shotgun-spacing').value='0.75';gateUiNode('shotgun-count').value='6';gateUiState.intersectionCatalog={version:'fixture'};
renderGateGo();assert.equal(gateGo.disabled,false,'valid settings, placed pins, and a catalog enable initial gate generation');assert.match(gateGo.textContent,/Generate Both Gate Sets/);
gateUiState.shotgunSuggestions={gates:[{selected:true}]};gateUiState.destinationShotgunSuggestions={gates:[{selected:true}]};renderGateGo();assert.equal(gateGo.disabled,false,'GO remains usable after both gate sets have been generated');assert.match(gateGo.textContent,/Regenerate Both Gate Sets/);
gateUiNode('shotgun-inner').value='5';renderGateGo();assert.equal(gateGo.disabled,true,'edited invalid circle bounds disable gate regeneration');gateUiNode('shotgun-inner').value='4';renderGateGo();assert.equal(gateGo.disabled,false,'valid settings restore the regeneration action');
gateUiNode('shotgun-inner').value='4.25';gateUiState.shotgunSuggestions=null;gateUiState.destinationShotgunSuggestions=null;renderGateGo();assert.equal(gateGo.disabled,false,'a valid changed configuration remains available for fresh gate generation');assert.match(gateGo.textContent,/Generate Both Gate Sets/,'stale generated gates are not presented as current after settings change');
gateUiState.busy=true;renderGateGo();assert.equal(gateGo.disabled,true,'GO is disabled during route/evidence work');gateUiState.busy=false;
gateUiState.gateGenerationPending=true;renderGateGo();assert.equal(gateGo.disabled,true,'GO is disabled while a gate generation is pending');gateUiState.gateGenerationPending=false;
gateUiState.catalogBusy.start=true;renderGateGo();assert.equal(gateGo.disabled,true,'GO is disabled while a Census catalog search is active');gateUiState.catalogBusy.start=false;
gateUiState.intersectionCatalog=null;gateUiState.intersectionCatalogs={start:null,destination:null};gateUiState.catalogFaults.start=null;gateUiState.catalogRetryPage.start=null;renderGateGo();assert.equal(gateGo.disabled,true,'GO requires a catalog when no approved retry exists');
gateUiState.catalogFaults.start={kind:'ring'};gateUiState.catalogRetryPage.start='saved-page';gateGo.textContent='Retry Start Census lookup';renderGateGo();assert.equal(gateGo.disabled,false,'an explicitly saved Census retry page enables recovery');assert.equal(gateGo.textContent,'Retry Start Census lookup','the generation control preserves its specific retry label');
gateUiNode('prepare-shotgun-batch').disabled=true;assert.equal(gateUiState.stage,'prepare');assert.equal(gateUiState.draft,null);assert.equal(gateUiNode('prepare-shotgun-batch').disabled,true,'route search remains disabled without a prepared current-gates batch');assert.equal(gateUiProviderCalls,0,'readiness and recovery checks make no provider requests');
const mapControlsStart=html.indexOf('<div id="map-display-controls"'),mapControlsEnd=html.indexOf('<div class="route-comparison-map-controls">',mapControlsStart),mapWorkspaceStart=html.indexOf('<section class="map-workspace"');
assert(mapWorkspaceStart>=0&&mapControlsStart>mapWorkspaceStart&&mapControlsEnd>mapControlsStart,'map display controls live in the map workspace outside workflow stage panels');
const mapControlsMarkup=html.slice(mapControlsStart,mapControlsEnd);
assert.match(mapControlsMarkup,/id="map-display-controls"[^>]*role="group"[^>]*aria-label="Map display controls"/,'the shared map controls are one accessible group');
for(const id of ['show-all-known-avm-cells','show-red-cluster-zones','cell-color-opacity','route-line-color-picker','route-line-color-wheel','route-line-opacity','route-line-thickness','fit-map','toggle-turn-bubbles']){
  assert(mapControlsMarkup.includes(`id="${id}"`),`map display group contains ${id}`);
  assert.equal((html.match(new RegExp(`\\bid="${id}"`,'g'))||[]).length,1,`${id} remains a unique control ID`);
}
assert(html.indexOf('id="candidate-title"')<html.indexOf('id="primary-ranking"'),'the map heading remains above route rankings');
const guide=f.env.RouteGuidance.guidanceFor;
const blocked={stage:'search',endpointCheck:{status:'blocked',points:[{pin:'origin',within_limit:false,nearest_road_distance_m:346.63},{pin:'destination',within_limit:true,nearest_road_distance_m:5.14}]}};
let advice=guide(blocked,'');assert.match(advice.title,/starting pin/);assert.match(advice.description,/347 metres/);assert.equal(advice.target,'#pick-origin');assert.equal(advice.targetStage,'prepare');assert.doesNotMatch(advice.title,/wait|finish/i);
advice=guide({...blocked,endpointCheck:{status:'blocked',points:[{pin:'origin',within_limit:true},{pin:'destination',within_limit:false,nearest_road_distance_m:null}]}},'');assert.match(advice.title,/destination/);assert.equal(advice.target,'#pick-destination');assert.match(advice.description,/No suitable driving road/);
for(const [error,title]of [['No suitable edges near location','finished without usable routes'],['No path could be found for input','finished without usable routes'],['Connection unavailable','finished without usable routes']]){advice=guide({stage:'search',routes:[],draft:{shotgun:{batch:{status:'completed',requests:[{status:'attempt_spent_failed',error}]}}}},'');assert.match(advice.title,new RegExp(title));assert.doesNotMatch(advice.title,/Let.*finish/);}
advice=guide({stage:'search',routes:[],draft:{shotgun:{batch:{status:'stopped_unknown'}}}},'');assert.match(advice.description,/do not replay/);
advice=guide({stage:'search',routes:[],draft:{shotgun:{batch:{status:'completed',requests:[],failed_requests:0}}}},'');assert.match(advice.title,/No routes fit/);
advice=guide({stage:'prepare',busy:true,endpointCheck:{status:'checking'}},'');assert.match(advice.title,/check your pins/);
advice=guide({stage:'search',routes:[{id:'returned'}]},'');assert.match(advice.title,/ready/);
assert.match(html,/<script src="guided-mode.js" defer>/);assert.match(build,/'\/guided-mode.js':/,'the hosted Worker serves the new asset');
assert.match(html,/id="lesson-overlap"[^>]+stroke="#7138c9"[^>]+stroke-width="3"[^>]+opacity="1"/);
console.log('Guided Mode: state preservation, gate/route action separation, GO readiness through edits/busy/catalog/retry states, approval boundaries, display-control visibility, saved appearance choices, and isolated practice passed.');
