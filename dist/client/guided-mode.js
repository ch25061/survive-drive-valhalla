(function (root) {
  'use strict';
  const KEY='route-screwtiny.experience.v1';
  const stages={
    prepare:{number:1,title:'Where are you going?',description:'Place your start and destination using addresses or the map. Check both pins. Then generate Route Gates â€” points near each end used to find alternatives.',why:'GO looks for roads around both trip ends. In Guided Mode, review both gate sets and the route-search settings before choosing Find routes. Limited gate sets need your decision.'},
    search:{number:2,title:'Let the route search finish',description:'The search tries the reviewed gate combinations. Watch the real progress below. If the connection fails, read the message before deciding to retry.',why:'Your route-time limit and Exclusion Zones apply to this search. No live traffic is included. Hiding zones on the map only hides their drawing.'},
    evaluate:{number:3,title:'Understand your route choices',description:'First, the app checks saved evidence for the whole route pool. Review the ranking and known coverage. For comparison, show route families and check two cards; their map appears automatically.',why:'Orange is a property-value signal, not a safety verdict. Grey means unknown. More evidence is optional after the required pool screen; new lookups need a reviewed plan and your approval.'},
    inspect:{number:4,title:'Take a closer look',description:'Select a route cell or an inspection point, then open available Street View imagery. Use what you see and the evidence coverage to make your own assessment.',why:'Pictures and property values cannot promise safety. Missing or failed lookups remain unknown. You can keep reviewing without requesting more evidence.'},
    choose:{number:5,title:'Choose the route you want',description:'Check the selected route, record your choice, then use the OsmAnd handoff. Android setup explains the companion and navigation steps.',why:'Checking two cards compares routes. Selecting a route and recording your choice are separate decisions. Export this session to keep your work before closing the tab.'}
  };
  function guidanceFor(state,instruction){
    const stage=stages[state?.stage]?state.stage:'prepare',base=stages[stage];
    const busy=!!state?.busy||!!state?.gateGenerationPending||!!state?.catalogBusy?.start||!!state?.catalogBusy?.destination;
    const model={...base,stage,next:busy?'Work is in progress. Follow the progress below; no extra click is needed.':instruction||({prepare:'Enter your start address and ZIP, or use Set start on map.',search:'Review the route-search status below.',evaluate:'Review the whole-pool screening status below.',inspect:'Choose a cell on the map to inspect.',choose:'Review the selected route and record your choice.'})[stage],busy,actionLabel:'Show me where',tone:'normal'};
    const check=state?.endpointCheck,batch=state?.draft?.shotgun?.batch,requests=batch?.requests??[],errors=requests.map(request=>String(request.error??''));
    if(busy){model.title=check?.status==='checking'?'First, letâ€™s check your pins':stage==='search'?'Your route search is running':'One thing at a time';model.description=check?.status==='checking'?'We are checking whether S and D are close enough to suitable driving roads. This makes no route request and no property-value lookup.':'Watch the progress below. You can wait here; no extra click is needed.';return model;}
    if((stage==='prepare'||stage==='search')&&check?.status==='blocked'){
      const point=check.points.find(point=>!point.within_limit),start=point.pin==='origin',label=start?'starting':'destination',gap=point.nearest_road_distance_m;
      Object.assign(model,{tone:'attention',title:'Letâ€™s fix your '+label+' pin first',description:(Number.isFinite(gap)?'Your '+label+' pin is about '+Math.round(gap)+' metres from the nearest suitable driving road.':'No suitable driving road was found near your '+label+' pin.')+' It needs to be within 100 metres. We stopped before sending a route batch.',next:'Use Set '+(start?'start':'destination')+' on map, zoom in, and place '+(start?'S':'D')+' on the street or driveway where you intend to '+(start?'start':'finish')+' driving. Then select GO to check both pins and rebuild your route gates.',why:'Your other pin stays where you placed it. If both pins need attention, we will guide you through them one at a time. Pins are never moved automatically.',target:start?'#pick-origin':'#pick-destination',targetStage:'prepare',actionLabel:'Show '+(start?'start':'destination')+' pin control'});return model;
    }
    if((stage==='prepare'||stage==='search')&&check?.status==='unavailable'){
      Object.assign(model,{tone:'attention',title:'We need to finish the pin check',description:check.error,next:instruction||'Check the desktop Valhalla connection. Then select GO, or Retry route search if the batch is already prepared.',why:'An unavailable check is not evidence that your pins are wrong. Your trip and saved evidence are retained. No route batch is sent until both pins are checked.',target:'#check-local-valhalla',targetStage:'search',actionLabel:'Show connection check'});return model;
    }
    if(stage==='search'&&(!state?.routes?.length||batch?.status?.startsWith('stopped'))){
      if(batch?.status==='completed'){
        const failed=requests.some(r=>r.status==='attempt_spent_failed')||batch.failed_requests>0;
        const pinFailure=errors.some(error=>/No suitable edges near location|within 100 m/i.test(error)),noPath=errors.some(error=>/No path could be found/i.test(error));
        Object.assign(model,{tone:'attention',title:failed?'The search finished without usable routes':'No routes fit these settings',description:pinFailure?'A trip point could not connect to a suitable driving road. Start by checking S and D on streets or driveways. A gate can also cause this error.':noPath?'The roads could not connect through these gates and Exclusion Zones. Review your trip settings before starting a fresh search.':failed?'The search has ended. Read the request error below before deciding what to change.':'The search finished, but no route met your time and exclusion limits. Review those settings and your gate choices.',next:'Open Set the trip. '+(pinFailure?'Select GO to check your pins before rebuilding the gates.':'Review the highlighted settings, then prepare a fresh route search.'),why:'Waiting will not produce more routes. No AVM requests were made by this route search. Changing map visibility does not change Exclusion Zones.',target:'[data-step="prepare"]',actionLabel:'Show trip settings'});
      }else if(batch?.status?.startsWith('stopped'))Object.assign(model,{tone:'attention',title:'The search stopped â€” read this first',description:batch.status==='stopped_unknown'?'At least one sent request has an unknown outcome. Keep this session and review the report; do not replay this batch.':'The search has stopped. Review its report before preparing another batch.',why:'No automatic retry is made. Already sent attempts still count. Export this session before reloading or signing in again.'});
      else Object.assign(model,{title:'Your route search is waiting to start',description:'No route search is running yet. Follow the next move below; a prepared batch waits here if its connection check needs attention.'});
    }else if(stage==='search'&&state?.routes?.length)Object.assign(model,{title:'Your route choices are ready',description:'The search has returned candidates. Open Evaluate to check their saved evidence and rankings.'});
    if(stage==='prepare'&&/starting address|starting point|start address/i.test(model.next))Object.assign(model,{title:'First, choose where you will start',description:'Enter an address and ZIP, or use Set start on map and click the street or driveway where your drive begins. Zoom in so the pin lands where you intend.',actionLabel:'Show starting point'});
    else if(stage==='prepare'&&/destination address/i.test(model.next))Object.assign(model,{title:'Now choose where you will finish',description:'Place D at the street or driveway where your drive ends. Then review both pins. GO checks them before looking for route gates.',actionLabel:'Show destination'});
    if(stage==='evaluate'&&state?.poolScreening?.plan)model.why='Read the exact lookup count and cost before you approve. More evidence is optional. Grey cells stay unknown until usable evidence arrives; they do not become favorable just because they are unmeasured.';
    return model;
  }
  // Explain the canonical next action. This layer never starts work or grants approval.
  function explainAction(model,state,targetId=''){
    const guide={steps:[model.next],after:'The help will change when this step is complete.',meaning:model.why,stuck:'Use "Show this control" to find the next control. You can switch to Super User Mode at any time.'};
    if(!model.busy&&model.tone!=='attention'){
      const headings=[[/origin|pick-origin/,'Enter your starting address'],[/destination|pick-destination/,'Enter your destination address'],[/^map$/,'Click the place for your pin'],[/red-cutoff|confirm-red/,'Choose what Orange means'],[/pool-screening-budget/,'Choose how many extra estimates you want'],[/approve-pool|send-avm|pool-screening-summary|prepare-pool-evolution/,state?.poolScreening?.plan||state?.avmPlan?'Review the lookup count before you approve':'Calculate the extra lookup count'],[/primary-ranking|candidate-list/,'Read the ranking and compare paths'],[/suggest-shotgun|prepare-shotgun|generate-time-limited|shotgun-settings|generate-fresh/,'Check your trip, then find routes'],[/accept-limited/,'Decide whether to use fewer route options'],[/review-cell|inspection-coords|streetview|assessment|save-note/,'Look at a place along this route'],[/choose-ranked|export-choice|navigate-osmand/,'Record your choice and set up your phone']];
      guide.heading=headings.find(([pattern])=>pattern.test(targetId))?.[1];
    }
    const give=(steps,after,meaning,stuck)=>Object.assign(guide,{steps,after,meaning:meaning||guide.meaning,stuck:stuck||guide.stuck});
    const start=/origin|pick-origin/.test(targetId),place=start?'start':'destination',letter=start?'S':'D';
    if(model.busy)return give(['Wait while this task finishes.','Watch the progress message below. You do not need to click again.'],'You will see either the next step or a message explaining what needs fixing.','The app is still working. Clicking again will not make it faster.','If progress stops, read the status message. Keep this session open so you do not lose the report.');
    if(model.tone==='attention'){
      if(state?.endpointCheck?.status==='blocked'&&model.target?.startsWith('#pick-'))return give(['Select Set '+place+' on map.','Zoom in. Click the street or driveway where you want '+letter+' to be.','Check the new pin. Then select GO to check both pins again.'],'The app will check the pins again. Both must be within 100 metres of a suitable driving road.',model.why,'If the pin still fails, try the street next to the driveway. The app will not move the pin for you.');
      return give([model.next],'The app will check again only when you use the indicated control.',model.why,'Read the message above first. Keep your current session. Use "Show this control" to find the place to fix it.');
    }
    if(/pick-origin|pick-destination|find-origin|find-destination|^origin-address$|^destination-address$/.test(targetId))return give([
      'Find the '+place+' Street address and ZIP code boxes in this section.',
      'Type the house number and street, then the ZIP code. Select "Find address and place '+letter+' on map".',
      'Check that '+letter+' is at the street or driveway where you will '+(start?'begin':'end')+' the drive. Or use "Set '+place+' on map" and click that spot.'
    ],start?'Once S is placed, we will help you place D.':'Once both pins are placed, choose Generate route gates. GO checks them and creates the gate sets first.','S means start. D means destination. A pin marks the exact place your drive begins or ends.','If the address is not found, check the spelling and ZIP. Or zoom in on the map and place the pin yourself.');
    if(model.mapPinPlaced){guide.heading='Your '+(model.mapPlacementTarget==='origin'?'start':'destination')+' pin is placed';return give(['Look for '+(model.mapPlacementTarget==='origin'?'S':'D')+' where you clicked.','The map stays at the same zoom and position.','When ready, select See my choices to continue.'],'The guide will offer the next decisions when you ask.','Placing a pin does not generate gates or request routes.','If the pin is wrong, use Set start on map or Set destination on map and click again.');}
    if(targetId==='map')return give(['You have turned on pin placement.','Zoom in until you can see the street you want.','Click once on the street or driveway. Check the S or D marker.'],'The pin will be placed where you click. Then the guide will show the next step.','The map is waiting for your click. Placing a pin does not start a route search.','If you click the wrong place, use Set start on map or Set destination on map again.');
    if(/suggest-shotgun|prepare-shotgun|generate-time-limited|shotgun-settings|generate-fresh/.test(targetId)){
      if(model.gatesReady){guide.heading='Review the route search, then find routes';return give(['Review the generated Start and Destination Route Gates.','Set the longest drive you will accept and review the areas routes must avoid. You can keep the current settings.','Select Generate fresh route candidates when ready. This starts the reviewed route-search process.'],'Watch the route-search progress. Then review the ranked routes.','Route gates are points near each end used to explore different paths. Exclusion Zones apply to the route search even when hidden on the map.','You can review the gates or settings before starting. No route request starts simply by opening these controls.');}
      guide.heading='Generate your route gates';return give(['Review the inner and outer circle sizes, number of gates, and spacing below. You can keep the defaults.','Select GO â€” Generate Both Route Gate Sets. It checks both pins and finds roads in those circles.','Wait for both sets. If fewer gates are found, decide whether to accept them or adjust the settings.'],'Once both sets are ready, review the route-search settings before choosing Find routes.','Route gates are extra points near each end of your trip. Generating them comes before requesting routes.','Do not click GO again while it is working. If a road-data or pin check fails, read its message before retrying.');
    }
    if(/accept-limited/.test(targetId))return give(['The app found fewer route gates than requested.','Read how many were found. Fewer gates mean fewer route options.','Accept this smaller set only if you want to continue with it. Otherwise change the gate settings and try again.'],'After both gate sets are accepted, review the route-search settings before choosing Find routes.','A smaller gate set is usable, but explores fewer combinations. This choice belongs to you.');
    if(targetId==='check-local-valhalla')return give(['Use the highlighted connection check.','Read the result. If it fails, make sure the desktop road service is running.','When the connection is ready, use GO or the displayed Retry route search control.'],'A successful connection check allows the pin check or route search to continue.','Valhalla is the road service that calculates the route. Your saved trip stays in this session.','Save your session before signing in again or refreshing. A failed connection check does not mean your pins are wrong.');
    if(/red-cutoff|confirm-red/.test(targetId))return give(['Read the dollar amount above the Orange slider.','Keep it or move the slider to the value you want.','Select Apply if the app asks you to confirm it.'],'The existing routes are ranked using this setting. This step does not buy new property estimates.','PPSQFT means estimated home value per square foot. Orange means below your chosen amount. It is a property-value clue, not a safety rating. Grey means the value is unknown.');
    if(targetId==='pool-screening-budget')return give(['Decide whether you want extra property estimates.','Enter 0 to use the evidence already saved. A higher number allows up to that many new unknown cells per included route.','If you want extra estimates, calculate the exact lookup count before approving a round.'],'You will see the exact number of new lookups before they start.','A cell is one hexagon on the map. A lookup asks the property service for an estimate for that cell. New lookups can use paid credits. Shared cells are requested once.','You can keep the current evidence and continue reviewing the routes. More lookups are optional.');
    const paid=!!state?.avmPlan||!!state?.poolScreening?.plan;
    if(/approve-pool|send-avm|pool-screening-summary|prepare-pool-evolution/.test(targetId))return give(paid?['Read the exact new-lookup count and the routes included in this round.','If you want those lookups, use the approval control. This spends up to the displayed number of attempts.','If you do not want them, keep reviewing your routes. Do not approve.']:['Review the route ranking and decide whether extra evidence would help.','Use Calculate exact One Round lookups to check saved evidence and calculate the new-lookup count.','Read the resulting plan. It waits for your approval before any new property lookup.'],paid?'If you approve, this one round runs and the ranking updates. Failed attempts still count.':'The exact plan appears. Calculation alone does not approve the new lookups.','An evidence round gathers more property estimates. It does not guarantee safety. Unknown cells stay unknown until usable evidence arrives.','There are no automatic retries. If a round stops, keep the report and read its explanation before deciding what to do.');
    if(/primary-ranking|candidate-list|ranking-mode/.test(targetId))return give(['Look at the route with the lowest rank number first. Rank 1 has the best score under your settings.','Read its drive time and known coverage. Coverage tells you how much of the route has usable property evidence.','To compare paths, select the route families display and check two route cards. The map shows the pair automatically.'],'Select a route card to look at that route. Use Look around to inspect places along it.','A route family is a group of similar paths. Purple means exact shared route segments. Grey hexagons have unknown values. A high rank is advice, not a safety promise.','A comparison checkmark compares a route. It does not record your choice for navigation. Uncheck one card to end the comparison.');
    if(/review-cell|inspection-coords|streetview|assessment|save-note/.test(targetId))return give(['Select a hexagon along the route or an inspection point on the map.','Open Street View when it is available. Look at the street and surroundings.','Add an observation or assessment if you wish, then save the review.'],'Your review stays with this session. When ready, open Choose or adjust to record your route.','Street View is a photograph from a particular date. It helps you look around, but does not tell you current conditions or promise safety.','If there is no image, choose another point. Missing information stays unknown.');
    if(/choose-ranked|export-choice|navigate-osmand/.test(targetId))return give(['Check that the selected route is the one you want. Comparison checkmarks do not choose it.','Use Choose selected route to record your decision if you have not done that yet.','Use the displayed OsmAnd handoff. Open Android setup for the phone installation and transfer instructions.'],'Your recorded choice is the route used for the phone handoff. Export your session to keep your work.','OsmAnd is the phone navigation app. The RS Android companion transfers the chosen route to it.','If the phone is not set up yet, open Android setup. You can save your session and return to this step later.');
    if(model.stage==='search')guide.after='When candidates are ready, open Evaluate to see their ranking and evidence.';
    return guide;
  }
  root.RouteGuidance={guidanceFor,explainAction};
  if(!root.document)return;
  const doc=root.document,$=id=>doc.getElementById(id);
  if(!$('mode-guided'))return;
  let mode='guided',advanced=false,scheduled=false,lastFocus=null,currentModel=null;
  try{if(root.localStorage.getItem(KEY)==='super')mode='super';}catch{}
  const setText=(id,text)=>{if($(id).textContent!==text)$(id).textContent=text;};
  function classify(){
    // Presentation only. Mandatory decisions, budgets, plan summaries and approval controls stay visible.
    const selectors=['#trip-endpoints label:has(> #origin-name)','#trip-endpoints label:has(> #destination-name)','#trip-endpoints label:has(> #origin)','#trip-endpoints label:has(> #destination)','#trip-form > .form-pair','#trip-form > .form-pair + .hint','#here-approval-panel details:has(#request-preview)','#download-request','#download-response','#here-approval-panel > details:has(#paste-valhalla-request)','#download-example','#pool-ranking-baseline-control','label:has(> #pool-ranking-cull-percent)','#pool-ranking-cull-help','#pool-ranking-cull-preview','#pool-screening-route-allocation-details','#pool-screening-ledger-details','#pool-screening-plan-details details:has(#pool-screening-plan)','.round-history'];
    for(const selector of selectors)for(const el of doc.querySelectorAll(selector))el.classList.add('guided-advanced-control');
    for(const el of doc.querySelectorAll('.guided-advanced-control'))el.classList.toggle('guided-required-control',!!el.querySelector('.next-action-target')||el.classList.contains('next-action-target'));
  }
  function update(){
    scheduled=false;
    const state=root.SurviveDrive?.getState?.()||{},cue=$('next-action');
    const context=root.SurviveDrive?.getGuidanceContext?.()||{};
    const model=guidanceFor(state,cue&&!cue.hidden?$('next-action-text')?.textContent:'');
    model.gatesReady=context.gatesReady===true;
    if(context.mapPlacementHeld){Object.assign(model,{target:'#map',mapPlacementHeld:true,mapPinPlaced:context.mapPinPlaced,mapPlacementTarget:context.mapPlacementTarget,title:context.mapPinPlaced?'Your pin is placed':'Place your pin on the map',next:context.mapPinPlaced?'Look for the pin where you clicked. Select See my choices when ready.':'Click the street or driveway where you want the pin.',description:'Keep the map in view while placing your trip point.'});}
    else if(model.stage==='prepare'&&!model.busy&&model.tone==='normal'&&context.originReady&&context.destinationReady&&!state.catalogFaults?.start&&!state.catalogFaults?.destination&&!context.startGatesLimited&&!context.destinationGatesLimited){model.target=context.gatesReady?'#generate-time-limited-routes':'#suggest-shotgun';model.title=context.gatesReady?'Review your route-search settings':'Generate your route gates';model.actionLabel=context.gatesReady?'Show route-search settings':'Show gate-generation controls';model.description=context.gatesReady?'Both gate sets are ready. Review them, the drive-time limit, and Exclusion Zones before requesting routes.':'Both pins are placed. Generate gates near each end first; route-search settings come next.';model.next=context.gatesReady?'Review the settings, then select Generate fresh route candidates.':'Review the circle and gate settings, then select GO â€” Generate Both Route Gate Sets.';}
    doc.body.dataset.guidedGatesReady=String(context.gatesReady===true);
    if(!model.mapPlacementHeld&&model.tone==='normal'&&model.stage==='prepare'&&!model.busy){const canonical=doc.querySelector('.next-action-target');if(canonical?.id==='pick-origin')model.target='#origin-address';else if(canonical?.id==='pick-destination')model.target='#destination-address';}
    if(model.target?.startsWith('#pick-')&&doc.querySelector(model.target)?.disabled){const start=model.target==='#pick-origin';model.target=start?'#origin-address':'#destination-address';model.actionLabel='Show '+(start?'start':'destination')+' address';model.next='Map picking is unavailable here. Enter the '+(start?'starting':'destination')+' street address and ZIP, then select Find address and place '+(start?'S':'D')+' on map. Check the resulting pin and select GO.';}
    currentModel=model;$('guided-coach').dataset.tone=model.tone;setText('guided-show-next',model.actionLabel);
    doc.body.dataset.guidedStage=model.stage;
    const pointReady=id=>{const parts=String($(id)?.value||'').split(',');return parts.length===2&&parts.every(part=>part.trim()&&Number.isFinite(Number(part)))&&Math.abs(Number(parts[0]))<=90&&Math.abs(Number(parts[1]))<=180;};
    doc.body.dataset.guidedTripReady=String(pointReady('origin')&&pointReady('destination'));
    const progress=[['start',pointReady('origin'),'Start pin placed'],['destination',pointReady('destination'),'Destination pin placed'],['roads',state.endpointCheck?.status==='ready','Both pins checked for driving roads'],['routes',!!state.routes?.length,'Route choices returned'],['choice',!!state.choice,'Your route choice recorded']];
    for(const [id,complete,label]of progress){const node=$('guided-check-'+id);if(node){node.textContent=(complete?'âœ“ ':'â—‹ ')+label;node.dataset.complete=String(complete);}}
    classify();setText('guided-step','STEP '+model.number+' OF 5');setText('guided-title',model.title);setText('guided-description',model.description);setText('guided-next',model.next);setText('guided-why',model.why);
    const target=model.target?doc.querySelector(model.target):doc.querySelector('.next-action-target');
    renderExplanation(model,state,target);
    root.RouteDecisionTree?.update?.(state,root.SurviveDrive?.getGuidanceContext?.()||{});
    $('guided-show-next').disabled=model.busy||!target;
    $('guided-show-next').hidden=model.busy;
    root.SurviveDrive?.preserveTripMapView?.();
  }
  let inlineHelp=null,inlineKey='';
  function renderExplanation(model,state,target){
    const targetId=target?.id||target?.querySelector?.('input,select,textarea')?.id||(target?.localName==='summary'?target.parentElement?.id:'')||'';
    const help=explainAction(model,state,targetId),list=$('guided-instructions');
    const heading=help.heading||model.title;if($('guided-title'))setText('guided-title',heading);
    if(list&&typeof doc.createElement==='function'){
      const key=JSON.stringify(help.steps);if(list.dataset.steps!==key){list.replaceChildren(...help.steps.map(text=>{const li=doc.createElement('li');li.textContent=text;return li;}));list.dataset.steps=key;}
    }
    for(const [id,text]of [['guided-after',help.after],['guided-meaning',help.meaning],['guided-stuck',help.stuck],['guided-dock-text',model.busy?'Please wait. '+heading:heading]])if($(id))setText(id,text);
    const dock=$('guided-dock');if(dock)dock.hidden=mode!=='guided';
    const jump=$('guided-dock-show');if(jump){jump.hidden=model.busy;jump.disabled=!target||model.busy;}
    if(typeof doc.createElement!=='function')return;
    if(!inlineHelp){inlineHelp=doc.createElement('aside');inlineHelp.id='guided-inline-help';inlineHelp.className='guided-inline-help';inlineHelp.setAttribute('aria-label','Help for this control');}
    const key=JSON.stringify([heading,help]);
    if(inlineKey!==key){inlineKey=key;const title=doc.createElement('strong');title.textContent='Do this now: '+heading;const first=doc.createElement('p');first.textContent=help.steps[0];const details=doc.createElement('details'),summary=doc.createElement('summary');summary.textContent='Walk me through it';const steps=doc.createElement('ol');for(const text of help.steps){const li=doc.createElement('li');li.textContent=text;steps.append(li);}const meaning=doc.createElement('p');meaning.textContent=help.meaning;details.append(summary,steps,meaning);const after=doc.createElement('p');after.textContent='Then: '+help.after;inlineHelp.replaceChildren(title,first,details,after);}
    const anchor=doc.querySelector('.next-action-scope')||target?.closest?.('label')||target;
    const safe=anchor&&anchor!==inlineHelp&&!anchor.closest?.('#guided-coach,#guided-inline-help,#guided-dock');
    inlineHelp.hidden=mode!=='guided'||model.busy||model.mapPlacementHeld||!safe||!!target?.closest?.('#shotgun-parameter-controls');
    if(!model.mapPlacementHeld&&safe&&anchor.parentElement&&(inlineHelp.parentElement!==anchor.parentElement||inlineHelp.nextElementSibling!==anchor))anchor.before(inlineHelp);
  }
  function schedule(){if(scheduled)return;scheduled=true;root.queueMicrotask(update);}
  function setMode(value){
    root.SurviveDrive?.releaseTripMapView?.();mode=value==='super'?'super':'guided';
    root.RouteDecisionTree?.closeFloatingChoices?.();
    doc.body.dataset.experienceMode=mode;doc.body.dataset.guidedAdvanced=String(advanced);
    $('mode-guided').setAttribute('aria-pressed',String(mode==='guided'));
    $('mode-super').setAttribute('aria-pressed',String(mode==='super'));
    $('guided-coach').hidden=mode!=='guided';
    for(const details of doc.querySelectorAll('.guided-explainer'))details.open=mode==='super';
    setText('experience-description',mode==='guided'?'I will explain each step and point to the control you need. No technical knowledge needed.':'Super User Mode shows every control. Your trip, evidence, and selections are retained.');
    try{root.localStorage.setItem(KEY,mode);}catch{}
    update();root.dispatchEvent(new Event('resize'));
  }
  $('mode-guided').addEventListener('click',()=>setMode('guided'));
  $('mode-super').addEventListener('click',()=>setMode('super'));
  $('guided-advanced').addEventListener('click',()=>{
    advanced=!advanced;doc.body.dataset.guidedAdvanced=String(advanced);
    $('guided-advanced').setAttribute('aria-expanded',String(advanced));
    setText('guided-advanced',advanced?'Hide advanced controls':'Show advanced controls');
    update();root.dispatchEvent(new Event('resize'));
  });
  $('guided-show-next').addEventListener('click',()=>{
    root.SurviveDrive?.releaseTripMapView?.();
    if(currentModel?.targetStage)root.SurviveDrive?.setStage?.(currentModel.targetStage);
    let target=currentModel?.target?doc.querySelector(currentModel.target):doc.querySelector('.next-action-target');if(target?.disabled&&currentModel?.target?.startsWith('#pick-'))target=$(currentModel.target==='#pick-origin'?'origin-address':'destination-address');if(!target)return;
    root.RouteDecisionTree?.closeFloatingChoices?.();
    for(let parent=target;parent;parent=parent.parentElement)if(parent.localName==='details')parent.open=true;
    const focus=target.matches('button,input,select,textarea,summary,a[href]')?target:target.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary')||target;
    if(!focus.hasAttribute('tabindex')&&!focus.matches('button,input,select,textarea,summary,a[href]'))focus.setAttribute('tabindex','-1');
    const room=(root.innerHeight||0)-160-($('guided-dock')?.getBoundingClientRect?.().height||0)-10;
    const groupFits=mode==='guided'&&inlineHelp&&!inlineHelp.hidden&&inlineHelp.getBoundingClientRect?.().height+(target.getBoundingClientRect?.().height||0)+24<=room;
    const gateControls=target.closest?.('#shotgun-parameter-controls');
    const gateHeading=gateControls?doc.querySelector('#shotgun-settings > summary'):null;
    (gateHeading||(groupFits?inlineHelp:target)).scrollIntoView({behavior:'smooth',block:gateHeading||groupFits?'start':'center'});focus.focus({preventScroll:true});
  });
  $('guided-dock-show')?.addEventListener('click',()=>$('guided-show-next').click());
  $('guided-dock-explain')?.addEventListener('click',()=>root.RouteDecisionTree?.toggleFloatingChoices?.());
  const lesson=$('guided-lesson'),learned={pair:false,purple:false,uncheck:false,unknown:false};
  function renderLesson(){
    const a=$('lesson-route-a').checked,b=$('lesson-route-b').checked,pair=a&&b;
    if(pair)learned.pair=true;
    if(learned.pair&&!pair)learned.uncheck=true;
    $('lesson-line-a').hidden=!a;$('lesson-line-b').hidden=!b;$('lesson-overlap').hidden=!pair;
    // SVG does not implement the HTML hidden rendering rule uniformly.
    for(const id of ['lesson-line-a','lesson-line-b','lesson-overlap'])$(id).style.display=$(id).hidden?'none':'';
    $('lesson-purple').disabled=!pair;$('lesson-unknown').disabled=!learned.uncheck;
    setText('lesson-status',Object.values(learned).every(Boolean)?'Practice complete. In your real trip, two comparison checkmarks automatically display the pair.':pair?'Both routes are checked. Purple shows their exact shared start and finish.':learned.pair?'Comparison ended. You can inspect the grey cell next.':'First, check both routes to compare them.');
    for(const key of Object.keys(learned))$('lesson-step-'+key).classList.toggle('lesson-complete',learned[key]);
  }
  function resetLesson(){for(const key of Object.keys(learned))learned[key]=false;$('lesson-route-a').checked=false;$('lesson-route-b').checked=false;$('lesson-explanation').hidden=true;renderLesson();}
  $('guided-practice').addEventListener('click',()=>{lastFocus=doc.activeElement;resetLesson();lesson.showModal();});
  $('lesson-close').addEventListener('click',()=>lesson.close());
  lesson.addEventListener('close',()=>lastFocus?.focus());
  $('lesson-reset').addEventListener('click',resetLesson);
  for(const id of ['lesson-route-a','lesson-route-b'])$(id).addEventListener('change',renderLesson);
  $('lesson-purple').addEventListener('click',()=>{learned.purple=true;$('lesson-explanation').hidden=false;setText('lesson-explanation','Purple marks the exact shared path. The middle paths are separate, so they stay blue and vermilion. Uncheck either route to end this comparison.');renderLesson();});
  $('lesson-unknown').addEventListener('click',()=>{learned.unknown=true;$('lesson-explanation').hidden=false;setText('lesson-explanation','This grey cell has no usable property-value evidence. It remains unknown. A real new lookup requires a reviewed request and your approval; opening this example makes no request.');renderLesson();});
  // Application state notifications come from its existing next-action calculation.
  function initPanelAppearance(){
    const panel=doc.querySelector('.experience-bar'),opacity=$('mode-panel-opacity'),hue=$('mode-panel-color'),ink=$('mode-panel-text');
    if(!panel?.style?.setProperty||!opacity||!hue||!ink)return;
    const preferenceKey='route-screwtiny.mode-panel.v1';
    // One preference set styles the shared guide card and its controls.
    const panels=[doc.querySelector('.guide-panel-stack'),panel,$('guided-dock'),$('guided-floating-choices')].filter(element=>element?.style?.setProperty);
    // Each pair keeps the selected and unselected mode texts coordinated.
    const inks=[['Black','#08060d','#36303f'],['Charcoal','#303038','#15151c'],['Navy','#0c2d5e','#5e3d0c'],['Indigo','#302070','#50601b'],['Purple','#4b1478','#37601b'],['Burgundy','#711d3d','#1d6355'],['Green','#164b32','#4b162f'],['White','#ffffff','#fff0dc']];
    const valid=(value,min,max,fallback)=>Number.isInteger(value)&&value>=min&&value<=max?value:fallback;
    let saved={};try{saved=JSON.parse(root.localStorage.getItem(preferenceKey))||{};}catch{}
    opacity.value=String(valid(saved.opacity,10,100,85));hue.value=String(valid(saved.hue,0,360,180));ink.value=String(valid(saved.ink,0,7,4));
    const colorName=value=>value<15||value>=345?'Red':value<45?'Orange':value<75?'Yellow':value<165?'Green':value<195?'Teal':value<255?'Blue':value<300?'Purple':'Pink';
    function apply(save){
      const appearance={opacity:valid(Number(opacity.value),10,100,85),hue:valid(Number(hue.value),0,360,180),ink:valid(Number(ink.value),0,7,4)},colors=inks[appearance.ink];
      // A light text choice needs dark tinted surfaces and a dark halo.
      const lightText=appearance.ink===7;
      for(const surface of panels){
        surface.style.setProperty('--mode-panel-hue',String(appearance.hue));surface.style.setProperty('--mode-panel-opacity',String(appearance.opacity/100));surface.style.setProperty('--mode-panel-text',colors[1]);surface.style.setProperty('--mode-panel-inactive-text',colors[2]);
        surface.style.setProperty('--mode-panel-lightness',lightText?'22%':'85%');surface.style.setProperty('--mode-button-lightness',lightText?'20%':'94%');
        surface.style.setProperty('--mode-panel-text-shadow',lightText?'0 0 2px #000,0 1px 3px #000':'0 0 3px #ffffff80');
      }
      setText('mode-panel-opacity-value',appearance.opacity+'%');setText('mode-panel-color-value',colorName(appearance.hue));setText('mode-panel-text-value',colors[0]);
      opacity.setAttribute('aria-valuetext',appearance.opacity+'% opaque');hue.setAttribute('aria-valuetext',colorName(appearance.hue));ink.setAttribute('aria-valuetext',colors[0]);
      if(save)try{root.localStorage.setItem(preferenceKey,JSON.stringify(appearance));}catch{}
    }
    for(const control of [opacity,hue,ink])control.addEventListener('input',()=>apply(true));
    apply(false);
  }
  // Input listeners also cover address editing; no routing or approval handler is called here.
  doc.addEventListener('input',event=>{if(!event.target.closest('#guided-lesson'))schedule();});
  doc.addEventListener('change',event=>{if(!event.target.closest('#guided-lesson'))schedule();});
  root.RouteGuidance={guidanceFor,explainAction,schedule,update,setMode,getMode:()=>mode};
  initPanelAppearance();resetLesson();setMode(mode);
})(typeof window==='undefined'?globalThis:window);
