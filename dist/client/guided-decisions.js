(function(root){
  'use strict';
  function decisionsFor(state={},context={}){
    const stage=state.stage||'prepare',screen=state.poolScreening||{},check=state.endpointCheck;
    const busy=!!state.busy||!!state.gateGenerationPending||!!state.catalogBusy?.start||!!state.catalogBusy?.destination||['preparing','preparing_evolution','running'].includes(screen.status);
    const hasRoutes=!!state.routes?.length,ranked=hasRoutes&&context.rankingReady===true,selected=!!context.selectedRouteId,chosen=selected&&state.choice?.candidate_id===context.selectedRouteId;
    const plan=screen.plan||state.avmPlan,pair=context.comparisonCount||0,families=context.displayMode==='families';
    const result={node:'',path:[],title:'',description:'',choices:[]};
    const add=(id,label,description,selector,options={})=>result.choices.push({id,label,description,selector,kind:'focus',enabled:true,...options});
    const save=()=>add('save','Save my work','Download this session now so you can keep it before closing, refreshing, or signing in again.','#export-session',{kind:'activate'});
    if(busy){Object.assign(result,{node:'working',title:'The app is working',description:'Wait for this task to finish. The choices will update when the result is ready.',path:['Trip','Work in progress']});add('progress','See the progress','Read the status. Another click will not make the current work faster.','#workflow-status');save();return result;}
    if(['prepare','search'].includes(stage)&&['blocked','unavailable'].includes(check?.status)){
      const point=check.points?.find(p=>!p.within_limit),start=point?.pin==='origin';
      Object.assign(result,{node:check.status==='blocked'?'repair-pin':'connection',title:check.status==='blocked'?'Fix the pin before searching':'Restore the road connection',description:check.status==='blocked'?'The pin needs to be within 100 metres of a suitable driving road. Choose how to fix it.':'The pin check could not finish. Keep this session and check the connection.',path:['Trip',check.status==='blocked'?'Pin needs attention':'Connection needs attention']});
      if(check.status==='blocked'){add('repair-map','Move this pin on the map','Zoom in and place '+(start?'S':'D')+' on the street or driveway. Then select GO.','#pick-'+(start?'origin':'destination'),{stage:'prepare'});add('repair-address','Use a street address instead','Enter the address and ZIP, find it, then check the resulting pin.','#'+(start?'origin':'destination')+'-address',{stage:'prepare'});}
      else add('connection','Check the road connection','Check the desktop road service now. Then review its status before using GO or Retry. This check starts no route search.','#check-local-valhalla',{kind:'activate',stage:'search'});
      save();return result;
    }
    if(stage==='prepare'){
      const side=!context.originReady?'origin':!context.destinationReady?'destination':null;
      if(side){const start=side==='origin';Object.assign(result,{node:'place-'+side,title:start?'How do you want to set your start?':'How do you want to set your destination?',description:start?'First tell us where the drive begins. Choose one method.':'Your start is set. Now tell us where the drive ends.',path:start?['Trip','Set start']:['Trip','Start set','Set destination']});add('address','Enter an address and ZIP','Type the street address and ZIP. Then use Find address and place '+(start?'S':'D')+' on map.','#'+side+'-address');add('map','Place the pin on the map','Use Set '+(start?'start':'destination')+' on map, zoom in, then click the street or driveway.','#pick-'+side);return result;}
      const gatesReady=context.gatesReady===true,hasGates=context.startGatesGenerated===true||context.destinationGatesGenerated===true;
      Object.assign(result,{node:gatesReady?'gates-ready':'trip-ready',title:gatesReady?'Your route gates are ready. Review the route search.':'Both pins are placed. Next, generate route gates.',description:gatesReady?'Review the generated gates, longest drive, and areas to avoid. Then choose Find routes.':'Choose Generate route gates to see the gate controls. GO checks both pins and generates gates near each end. Route-search settings come afterward.',path:['Trip','Both pins placed',gatesReady?'Gates ready → Review route search':'Generate route gates']});
      if(!gatesReady&&!hasGates&&!state.catalogFaults?.start&&!state.catalogFaults?.destination&&!context.startGatesLimited&&!context.destinationGatesLimited)add('generate-gates','Generate route gates','Review the circle sizes, gate count, and spacing, then use GO to generate both gate sets. Opening these controls sends no request.','#suggest-shotgun');
      if(state.catalogFaults?.start||state.catalogFaults?.destination)add('gate-retry','Review the paused gate search','Read the failed-circle report before choosing the displayed Retry control.',state.catalogFaults.start?'#suggest-shotgun':'#suggest-destination-shotgun');
      for(const side of ['start','destination'])if(context[side+'GatesLimited'])add('limited-'+side,'Use the smaller '+side+' gate set','Accept this smaller gate set now. Fewer gates explore fewer route options. This does not start a route search.',side==='start'?'#accept-limited-shotgun':'#accept-limited-shotgun-destination',{kind:'activate'});
      if(gatesReady){add('search','Find routes','Generate fresh route candidates using your selected gates, time limit, and Exclusion Zones. You may want to review these settings first. This choice opens the search button; press it to begin.','#generate-time-limited-routes');add('gates','Review route gates','Look at the generated gates near each trip end on the map.','#map');add('regenerate-gates','Regenerate route gates','Not satisfied with the gates? Adjust the four gate settings, then press GO to generate both sets again. Opening the settings sends no request.','#suggest-shotgun');add('time','Set the longest drive I will accept','Set the maximum trip length before finding routes. Routes above this time are discarded.','#maximum-route-minutes');}
      else if(hasGates){add('generate-gates','Regenerate route gates','Adjust gate settings and use GO if you want another gate search.','#suggest-shotgun');add('gates','Review generated route gates','Look at the available gates on the map. Resolve any smaller gate set before finding routes.','#map');}
      add('zones','Review the areas routes must avoid','Changing the exclusion cutoff requires fresh route candidates. Hiding zones on the map only changes their visibility.','#exclusion-zone-level');
      return result;
    }
    if(!hasRoutes){const unknown=state.draft?.shotgun?.batch?.status==='stopped_unknown';Object.assign(result,{node:unknown?'search-unknown':'search-empty',title:unknown?'The stopped search needs review':'There are no route choices yet',description:unknown?'A sent request has an unknown outcome. Do not replay this batch. Save this session and review the report.':'Read the search report. You can review your trip or check the road connection.',path:['Trip','Search',unknown?'Outcome unknown':'No candidates']});add('report','Read the search report','Review what finished, failed, or remains unknown.','#here-result',{stage:'search'});if(!unknown)add('edit','Review my trip settings','Check the pins, time limit, exclusions and gates before preparing a fresh search.',null,{kind:'stage',stage:'prepare'});add('connection','Check the road connection','Check the desktop road service now. Read its result before deciding whether to retry. This check starts no route search.','#check-local-valhalla',{kind:'activate',stage:'search'});save();return result;}
    if(!ranked){Object.assign(result,{node:'before-ranking',title:'Routes are back. Next, prepare their ranking.',description:'The first ranking checks property evidence already saved. It does not buy new estimates. Inspection and route choice unlock after that check.',path:['Trip','Candidates returned','Ranking pending']});if(plan)add('plan','Review my pending lookup plan','Review the exact request count and cell list. Showing this control does not approve or spend credits.',context.approvalTarget||'#pool-screening-summary',{stage:'evaluate',cost:'Approval required'});if(!state.redThresholdConfirmed)add('orange','Review the Orange value cutoff','Orange means below your chosen property value per square foot. Apply the value before ranking.','#red-cutoff',{stage:'evaluate'});add('rank','Open the ranking step','Open Evaluate and follow its current saved-evidence check or prepared-plan instructions.',null,{kind:'stage',stage:'evaluate'});add('map-view','Look at the returned route on the map','You can view its path while the ranking is prepared.','#map-work-area');save();return result;}
    const display=families?'Route families':'Ranked list',comparison=pair===2?'Two routes compared':pair===1?'One comparison box checked':'No comparison pair';
    Object.assign(result,{node:'ranked-'+(families?'families':'list')+'-'+pair+(plan?'-plan':'')+(chosen?'-chosen':''),path:['Trip','Routes ranked',display,comparison,...(stage==='inspect'?['Look around']:stage==='choose'?['Choose route']:[])],title:'Your routes are ranked. Choose what to do next.',description:'You can take any ready branch below. Looking, grouping and comparing routes do not request new property estimates.'});
    add('select','Examine routes','Click a route card to select it. A comparison checkmark and a recorded navigation choice are separate decisions.','#candidate-list .candidate');
    if(plan)add('plan','Review my pending lookup plan','The exact count is ready. Review it before approving. Showing this control does not approve or spend credits.',context.approvalTarget||'#pool-screening-summary',{stage:'evaluate',cost:'Approval required'});
    if(stage==='inspect'&&state.cell){add('review-cell','Review this selected cell','Add an assessment or note for this cell, then save it.','#assessment',{stage:'inspect'});add('save-review','Save my cell review','Save the assessment or note you have entered for this cell. Enter a review first to enable this action.','#save-note',{kind:'activate',stage:'inspect',enabled:context.reviewSaveReady!==false,reason:'Enter an assessment or note first.'});}
    if(stage==='inspect'&&state.inspection)add('street-view','Look at available street photos',context.streetViewReady?'Open Google Street View for this point now. Images may be older than current conditions.':'There is no available Street View link for this point. Choose another inspection point.','#streetview',{kind:'activate',stage:'inspect',enabled:!!context.streetViewReady,reason:'Choose another point to find available imagery.'});
    add('display',families?'Return to the original ranked list':'Show Route Family presentation',families?'Show every route in its original rank order. Comparison selections stay recorded.':'Group similar paths into compact families. The best-ranked route stays at the top of each family. Rankings do not change.',null,{kind:'display',displayMode:families?'ranked':'families'});
    if(families){add('family-rules','Adjust which routes count as a family','Change required path overlap and nearby-path distance independently. This changes grouping, not rankings or route paths.','#route-family-overlap');
    }
    if(pair<2)add('compare',pair===1?'Choose a second route to compare':'Choose two routes to compare',families?(pair===1?'One route is already checked. Check a different card to display the pair automatically.':'Use the comparison checkboxes on any two cards, even in different families.'):'For easier comparison of different paths, try Route Family presentation. Use Show route families, then check two route cards to compare them on the map.',families?'#candidate-list .route-comparison-check input:not(:checked):not(:disabled)':'#toggle-route-family-display',{enabled:(context.comparableRouteCount??state.routes.length)>=2,reason:'Comparison needs two routes with complete saved paths.'});
    if(pair===2){add('comparison-map','Examine the comparison map','Blue and vermilion show the two paths. Thin purple marks exact shared segments. Nearby parallel roads do not count.','#map-work-area');add('end-comparison','End this comparison','End the comparison now. This clears the comparison checkmarks and overlay, while keeping your selected route and recorded navigation choice.','#end-route-comparison',{kind:'activate'});add('turns',context.turnBubblesVisible?'Hide white turn bubbles':'Show white turn bubbles','Change turn-bubble visibility now. Route paths stay displayed.','#toggle-turn-bubbles',{kind:'activate'});}
    add('undo-cull','Undo an overly aggressive cull','If too many routes were excluded, choose how many best-ranked routes to include in a fresh Round 0 baseline. This can bring excluded routes back and restarts later culls. Opening these controls makes no change.','#pool-ranking-baseline-included');
    add('inspect','Look around along the selected route','Open Look around, select a route cell or inspection point, and review available street imagery.',null,{kind:'stage',stage:'inspect',enabled:selected,reason:'Select a route card first.'});
    add('ranking-settings','Adjust how routes are scored','Review the travel-time versus Orange Miles setting. It reranks these routes without buying estimates.','#orange-mile-weight');
    if(!plan){add('evidence-count','Decide how much extra evidence I want','Enter 0 to keep saved evidence. A positive count allows new lookups per INCLUDED route, after exact calculation and your approval.','#pool-ranking-budget');add('evidence-routes','Choose which routes receive extra evidence','Use INCLUDED / EXCLUDED on the cards. Excluded routes stay ranked. Changing inclusion clears any prepared plan.','#candidate-list .route-quota-toggle');add('evidence-plan','Calculate the exact extra lookup count','Calculate a plan now using your current per-route count and INCLUDED routes. The cache check is free. New paid estimates wait for your separate approval.','#prepare-pool-evolution-ranking',{kind:'activate',enabled:context.evidenceCalculationReady!==false,reason:'Review the ranking and per-route count first.',cost:'Calculation only'});}
    if(chosen){add('phone','Send my recorded route to the phone',context.phoneReady?'Prepare the chosen route\'s phone link and QR code now. Scan it on your phone; this starts no route or AVM search.':'The phone handoff is not ready for this route. Review Android setup and the chosen-route message.','#send-route-to-phone',{kind:'activate',enabled:!!context.phoneReady&&!!context.selectedRouteValid,reason:'Complete the phone handoff prerequisites.'});add('android','Review Android phone setup','Open the companion and OsmAnd setup instructions.','a[href="/android.html"]',{kind:'activate'});}
    else add('choose','Record the selected route as my choice',context.selectedRouteValid?'Record the currently selected route as your navigation choice now. You can then send it to your phone.':'This selected route has not passed its endpoint check. Generate a valid route before choosing.','#choose-ranked-osmand-route',{kind:'activate',enabled:selected&&!!context.selectedRouteValid,reason:selected?'This route has not passed its endpoint check.':'Select a route card first.'});
    add('change-trip','Change the trip or search settings','Return to Set the trip. Changing pins, time or exclusions can discard these candidates and require a fresh search.',null,{kind:'stage',stage:'prepare'});save();return result;
  }
  root.RouteDecisionTree={decisionsFor};
  const doc=root.document;if(!doc?.getElementById('guided-floating-choices'))return;
  let latestTree=null,descriptionNumber=0,panelView='choices',helpTopic='step',returnTarget=null;
  const $=id=>doc.getElementById(id);
  function closeFloatingChoices(returnFocus=false){
    const panel=$('guided-floating-choices');if(!panel)return;
    panel.hidden=true;$('guided-dock-explain')?.setAttribute('aria-expanded','false');
    $('guided-gate-help')?.setAttribute('aria-expanded','false');$('guided-more-help')?.setAttribute('aria-expanded','false');
    $('show-gate-text-list')?.setAttribute('aria-expanded','false');
    if(returnFocus)(returnTarget?.id==='guided-more-help'?$('guided-dock-explain'):returnTarget||$('guided-dock-explain'))?.focus({preventScroll:true});
  }
  function renderPanelView(){
    const help=panelView==='help',gates=panelView==='gate-list';
    $('guided-floating-list').hidden=help||gates;$('guided-more-help').hidden=help||gates;$('guided-help-menu').hidden=!help;$('guided-help-back').hidden=!help||root.RouteGuidance?.getMode?.()==='super';
    if($('guided-gate-text-lists'))$('guided-gate-text-lists').hidden=!gates;
    $('guided-help-menu').dataset.topic=helpTopic;
    $('guided-floating-title').textContent=gates?'Route gate text lists':help?(helpTopic==='gates'?'Understand your route gates':'Understand this step'):latestTree?.title||'Your choices';
    $('guided-floating-description').textContent=gates?'The map is the main gate view. Use these lists to read gate details or change which gates are selected. Changing a selection sends no request; review the batch before searching.':help?'Read the overview, then open any topic for details and the reason behind it.':latestTree?.description||'';
    $('guided-floating-close')?.setAttribute('aria-label',gates?'Close gate text lists':'Close choices');
  }
  function toggleGateTextLists(){
    const panel=$('guided-floating-choices'),trigger=$('show-gate-text-list');if(!panel||!$('guided-gate-text-lists'))return;
    if(!panel.hidden&&panelView==='gate-list'){closeFloatingChoices(true);return;}
    panelView='gate-list';returnTarget=trigger;
    $('guided-gate-help')?.setAttribute('aria-expanded','false');$('guided-more-help')?.setAttribute('aria-expanded','false');
    update(root.SurviveDrive?.getState?.()||{},root.SurviveDrive?.getGuidanceContext?.()||{});
    panel.hidden=false;panel.scrollTop=0;trigger?.setAttribute('aria-expanded','true');$('guided-dock-explain')?.setAttribute('aria-expanded','false');
    $('guided-floating-title')?.focus({preventScroll:true});
  }
  function openHelp(topic='step',trigger=$('guided-more-help')){
    panelView='help';helpTopic=topic;returnTarget=trigger;
    $('show-gate-text-list')?.setAttribute('aria-expanded','false');
    update(root.SurviveDrive?.getState?.()||{},root.SurviveDrive?.getGuidanceContext?.()||{});
    if(topic==='gates')$('shotgun-help').open=true;
    $('guided-floating-choices').hidden=false;$('guided-dock-explain')?.setAttribute('aria-expanded','true');
    $('guided-floating-choices').scrollTop=0;trigger?.setAttribute('aria-expanded','true');
    $('guided-floating-title')?.focus({preventScroll:true});
  }
  function toggleFloatingChoices(){
    const panel=$('guided-floating-choices');if(!panel||root.RouteGuidance?.getMode?.()==='super')return;
    if(!panel.hidden&&panelView==='choices'){closeFloatingChoices(true);return;}
    panelView='choices';returnTarget=$('guided-dock-explain');
    $('show-gate-text-list')?.setAttribute('aria-expanded','false');
    $('guided-gate-help')?.setAttribute('aria-expanded','false');$('guided-more-help')?.setAttribute('aria-expanded','false');
    update(root.SurviveDrive?.getState?.()||{},root.SurviveDrive?.getGuidanceContext?.()||{});
    panel.hidden=false;$('guided-dock-explain')?.setAttribute('aria-expanded','true');
    $('guided-floating-title')?.focus({preventScroll:true});
  }
  $('guided-more-help')?.addEventListener('click',()=>openHelp());
  $('show-gate-text-list')?.addEventListener('click',toggleGateTextLists);
  $('guided-gate-help')?.addEventListener('click',()=>{if(!$('guided-floating-choices').hidden&&panelView==='help'&&helpTopic==='gates')closeFloatingChoices(true);else openHelp('gates',$('guided-gate-help'));});
  $('guided-help-back')?.addEventListener('click',()=>{panelView='choices';returnTarget=$('guided-dock-explain');$('guided-gate-help')?.setAttribute('aria-expanded','false');$('guided-more-help')?.setAttribute('aria-expanded','false');renderPanelView();$('guided-floating-title')?.focus({preventScroll:true});});
  $('guided-floating-close')?.addEventListener('click',()=>closeFloatingChoices(true));
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('guided-floating-choices')?.hidden&&$('guided-floating-choices')){event.preventDefault();event.stopPropagation();closeFloatingChoices(true);}});
  const guideCard=doc.querySelector('.guide-panel-stack'),floatingPanel=$('guided-floating-choices');
  if(guideCard&&floatingPanel&&typeof root.ResizeObserver==='function')new root.ResizeObserver(()=>floatingPanel.style.setProperty('--guide-card-height',Math.ceil(guideCard.getBoundingClientRect().height)+'px')).observe(guideCard);
  function focusControl(selector){
    const target=doc.querySelector(selector);if(!target)return false;
    // Gate settings can be reviewed even while GO itself is unavailable.
    const gateControls=target.id==='suggest-shotgun'?$('shotgun-parameter-controls'):null;
    if((target.disabled||target.getAttribute('aria-disabled')==='true')&&!gateControls)return false;
    if(['pick-origin','pick-destination'].includes(target.id)&&typeof root.SurviveDrive?.armMapPick==='function'){
      if(!root.SurviveDrive.armMapPick(target.id==='pick-origin'?'origin':'destination'))return false;
      const map=$('map');map?.setAttribute('tabindex','-1');map?.focus({preventScroll:true});return true;
    }
    for(let p=target;p;p=p.parentElement){if(p.localName==='details')p.open=true;if(p.classList.contains('guided-advanced-control'))p.classList.add('guided-choice-revealed');}
    const focus=gateControls&&target.disabled?gateControls.querySelector('input:not(:disabled),select:not(:disabled)')||gateControls:target.matches('button,input,select,textarea,summary,a[href]')?target:target.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href]')||target;
    if(!focus.matches('button,input,select,textarea,summary,a[href]'))focus.setAttribute('tabindex','-1');
    const gateHeading=gateControls?doc.querySelector('#shotgun-settings > summary'):null;
    const cardList=target.closest?.('#candidate-list'),cullControls=target.id==='pool-ranking-baseline-included'?$('pool-ranking-baseline-control'):null;
    (gateHeading||gateControls||cardList||cullControls||target).scrollIntoView({behavior:'smooth',block:gateControls||cardList||cullControls?'start':'center'});focus.focus({preventScroll:true});return true;
  }
  function chooseBranch(id){
    const app=root.SurviveDrive,state=app?.getState?.()||{},context=app?.getGuidanceContext?.()||{};
    const choice=decisionsFor(state,context).choices.find(c=>c.id===id);if(!choice?.enabled)return;
    closeFloatingChoices(true);
    app?.releaseTripMapView?.();
    const keepChosenView=['select','display','compare','undo-cull'].includes(choice.id);
    if(keepChosenView)app?.pauseGuidedFocus?.();
    for(const node of doc.querySelectorAll('.guided-choice-revealed'))node.classList.remove('guided-choice-revealed');
    if(choice.kind==='display'){app.setCandidateDisplayMode(choice.displayMode);focusControl('#candidate-list .candidate');}
    else if(choice.kind==='stage')app.setStage(choice.stage);
    else if(choice.kind==='activate'){
      if(choice.stage&&choice.stage!==state.stage)app.setStage(choice.stage);
      const target=doc.querySelector(choice.selector);
      if(!target||target.disabled||target.getAttribute('aria-disabled')==='true'||typeof target.click!=='function'||target.localName==='a'&&!target.getAttribute('href')){
        toggleFloatingChoices();$('guided-decision-feedback').textContent='This action is not ready. Review its required inputs and status.';return;
      }
      target.click();
    }
    else {if(choice.stage&&choice.stage!==state.stage)app.setStage(choice.stage);if(!focusControl(choice.selector)){toggleFloatingChoices();$('guided-decision-feedback').textContent='That control is not ready yet. Follow the current step and its status message.';}}
    root.RouteGuidance?.schedule();
    // The guide may move its inline instructions after the branch changes layout.
    // Reveal the chosen controls again after that update, without activating them.
    if(keepChosenView&&typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(()=>root.requestAnimationFrame(()=>focusControl(choice.kind==='display'?'#candidate-list .candidate':choice.selector)));
  }
  function cards(tree,compact=false){
    const list=doc.createElement('ul');list.className='guided-choice-list'+(compact?' is-compact':'');
    for(const choice of tree.choices){const item=doc.createElement('li'),button=doc.createElement('button'),description=doc.createElement('p');button.type='button';button.textContent=choice.label;button.disabled=!choice.enabled;button.dataset.decisionId=choice.id;description.id='guided-choice-description-'+(++descriptionNumber);button.setAttribute('aria-describedby',description.id);button.addEventListener('click',()=>chooseBranch(choice.id));description.textContent=choice.description+(choice.enabled?'':' '+choice.reason);item.append(button,description);if(choice.cost){const badge=doc.createElement('small');badge.textContent=choice.cost;item.append(badge);}list.append(item);}
    return list;
  }
  function update(state,context){
    latestTree=decisionsFor(state,context);const key=JSON.stringify(latestTree),guided=root.RouteGuidance?.getMode?.()!=='super';
    if(!guided&&panelView==='choices')closeFloatingChoices();
    if(floatingPanel&&floatingPanel.dataset.key!==key){floatingPanel.dataset.key=key;$('guided-floating-list').replaceChildren(cards(latestTree,true));$('guided-decision-feedback').textContent='';}
    renderPanelView();
  }
  root.RouteDecisionTree={decisionsFor,update,chooseBranch,toggleFloatingChoices,closeFloatingChoices,openHelp,toggleGateTextLists};
})(typeof window==='undefined'?globalThis:window);
