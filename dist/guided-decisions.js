(function(root){
  'use strict';
  function decisionsFor(state={},context={}){
    const stage=state.stage||'prepare',screen=state.poolScreening||{},check=state.endpointCheck;
    const busy=!!state.busy||!!state.gateGenerationPending||!!state.catalogBusy?.start||!!state.catalogBusy?.destination||['preparing','preparing_evolution','running'].includes(screen.status);
    const hasRoutes=!!state.routes?.length,ranked=hasRoutes&&context.rankingReady===true,selected=!!context.selectedRouteId,chosen=selected&&state.choice?.candidate_id===context.selectedRouteId;
    const plan=screen.plan||state.avmPlan,pair=context.comparisonCount||0,families=context.displayMode==='families';
    const result={node:'',path:[],title:'',description:'',choices:[]};
    const add=(id,label,description,selector,options={})=>result.choices.push({id,label,description,selector,kind:'focus',enabled:true,...options});
    const save=()=>add('save','Save my work','Export this session before closing, refreshing, or signing in again.','#export-session');
    if(busy){Object.assign(result,{node:'working',title:'The app is working',description:'Wait for this task to finish. The choices will update when the result is ready.',path:['Trip','Work in progress']});add('progress','See the progress','Read the status. Another click will not make the current work faster.','#workflow-status');save();return result;}
    if(['prepare','search'].includes(stage)&&['blocked','unavailable'].includes(check?.status)){
      const point=check.points?.find(p=>!p.within_limit),start=point?.pin==='origin';
      Object.assign(result,{node:check.status==='blocked'?'repair-pin':'connection',title:check.status==='blocked'?'Fix the pin before searching':'Restore the road connection',description:check.status==='blocked'?'The pin needs to be within 100 metres of a suitable driving road. Choose how to fix it.':'The pin check could not finish. Keep this session and check the connection.',path:['Trip',check.status==='blocked'?'Pin needs attention':'Connection needs attention']});
      if(check.status==='blocked'){add('repair-map','Move this pin on the map','Zoom in and place '+(start?'S':'D')+' on the street or driveway. Then select GO.','#pick-'+(start?'origin':'destination'),{stage:'prepare'});add('repair-address','Use a street address instead','Enter the address and ZIP, find it, then check the resulting pin.','#'+(start?'origin':'destination')+'-address',{stage:'prepare'});}
      else add('connection','Check the road connection','Check the desktop road service. Then use the displayed GO or Retry control.','#check-local-valhalla',{stage:'search'});
      save();return result;
    }
    if(stage==='prepare'){
      const side=!context.originReady?'origin':!context.destinationReady?'destination':null;
      if(side){const start=side==='origin';Object.assign(result,{node:'place-'+side,title:start?'How do you want to set your start?':'How do you want to set your destination?',description:start?'First tell us where the drive begins. Choose one method.':'Your start is set. Now tell us where the drive ends.',path:start?['Trip','Set start']:['Trip','Start set','Set destination']});add('address','Enter an address and ZIP','Type the street address and ZIP. Then use Find address and place '+(start?'S':'D')+' on map.','#'+side+'-address');add('map','Place the pin on the map','Use Set '+(start?'start':'destination')+' on map, zoom in, then click the street or driveway.','#pick-'+side);return result;}
      const gatesReady=context.gatesReady===true,hasGates=context.startGatesGenerated===true||context.destinationGatesGenerated===true;
      Object.assign(result,{node:gatesReady?'gates-ready':'trip-ready',title:gatesReady?'Your route gates are ready. Review the route search.':'Both pins are placed. Next, generate route gates.',description:gatesReady?'Review the generated gates, longest drive, and areas to avoid. Then choose Find routes.':'Choose Generate route gates to see the gate controls. GO checks both pins and generates gates near each end. Route-search settings come afterward.',path:['Trip','Both pins placed',gatesReady?'Gates ready → Review route search':'Generate route gates']});
      if(!gatesReady&&!hasGates&&!state.catalogFaults?.start&&!state.catalogFaults?.destination&&!context.startGatesLimited&&!context.destinationGatesLimited)add('generate-gates','Generate route gates','Review the circle sizes, gate count, and spacing, then use GO to generate both gate sets. Opening these controls sends no request.','#suggest-shotgun');
      if(state.catalogFaults?.start||state.catalogFaults?.destination)add('gate-retry','Review the paused gate search','Read the failed-circle report before choosing the displayed Retry control.',state.catalogFaults.start?'#suggest-shotgun':'#suggest-destination-shotgun');
      for(const side of ['start','destination'])if(context[side+'GatesLimited'])add('limited-'+side,'Use the smaller '+side+' gate set','Fewer gates explore fewer route options. Accept only if you want to continue with this smaller set.',side==='start'?'#accept-limited-shotgun':'#accept-limited-shotgun-destination');
      if(gatesReady){add('search','Find routes','Review your route-search settings, then use Generate fresh route candidates. Opening this control does not start the search.','#generate-time-limited-routes');add('gates','Review route gates','Look at the generated gates near each trip end and their selected combinations.','#shotgun-settings > summary');add('time','Set the longest drive I will accept','Set the maximum trip length before finding routes. Routes above this time are discarded.','#maximum-route-minutes');}
      else if(hasGates){add('generate-gates','Generate route gates again','Adjust gate settings and use GO if you want another gate search.','#suggest-shotgun');add('gates','Review generated route gates','Review the available gates and resolve any smaller gate set before finding routes.','#shotgun-settings > summary');}
      add('zones','Review the areas routes must avoid','Changing the exclusion cutoff requires fresh route candidates. Hiding zones on the map only changes their visibility.','#exclusion-zone-level');
      return result;
    }
    if(!hasRoutes){const unknown=state.draft?.shotgun?.batch?.status==='stopped_unknown';Object.assign(result,{node:unknown?'search-unknown':'search-empty',title:unknown?'The stopped search needs review':'There are no route choices yet',description:unknown?'A sent request has an unknown outcome. Do not replay this batch. Save this session and review the report.':'Read the search report. You can review your trip or check the road connection.',path:['Trip','Search',unknown?'Outcome unknown':'No candidates']});add('report','Read the search report','Review what finished, failed, or remains unknown.','#here-result',{stage:'search'});if(!unknown)add('edit','Review my trip settings','Check the pins, time limit, exclusions and gates before preparing a fresh search.',null,{kind:'stage',stage:'prepare'});add('connection','Check the road connection','Read its result before deciding whether to retry.','#check-local-valhalla',{stage:'search'});save();return result;}
    if(!ranked){Object.assign(result,{node:'before-ranking',title:'Routes are back. Next, prepare their ranking.',description:'The first ranking checks property evidence already saved. It does not buy new estimates. Inspection and route choice unlock after that check.',path:['Trip','Candidates returned','Ranking pending']});if(plan)add('plan','Review my pending lookup plan','Review the exact request count and cell list. Showing this control does not approve or spend credits.',context.approvalTarget||'#pool-screening-summary',{stage:'evaluate',cost:'Approval required'});if(!state.redThresholdConfirmed)add('orange','Review the Orange value cutoff','Orange means below your chosen property value per square foot. Apply the value before ranking.','#red-cutoff',{stage:'evaluate'});add('rank','Open the ranking step','Open Evaluate and follow its current saved-evidence check or prepared-plan instructions.',null,{kind:'stage',stage:'evaluate'});add('map-view','Look at the returned route on the map','You can view its path while the ranking is prepared.','#map-work-area');save();return result;}
    const display=families?'Route families':'Ranked list',comparison=pair===2?'Two routes compared':pair===1?'One comparison box checked':'No comparison pair';
    Object.assign(result,{node:'ranked-'+(families?'families':'list')+'-'+pair+(plan?'-plan':'')+(chosen?'-chosen':''),path:['Trip','Routes ranked',display,comparison,...(stage==='inspect'?['Look around']:stage==='choose'?['Choose route']:[])],title:'Your routes are ranked. Choose what to do next.',description:'You can take any ready branch below. Looking, grouping and comparing routes do not request new property estimates.'});
    if(plan)add('plan','Review my pending lookup plan','The exact count is ready. Review it before approving. Showing this control does not approve or spend credits.',context.approvalTarget||'#pool-screening-summary',{stage:'evaluate',cost:'Approval required'});
    if(stage==='inspect'&&state.cell){add('review-cell','Review this selected cell','Add an assessment or note for this cell, then save it.','#assessment',{stage:'inspect'});add('save-review','Save my cell review','Use the Save control after entering your assessment or note.','#save-note',{stage:'inspect'});}
    if(stage==='inspect'&&state.inspection)add('street-view','Look at available street photos',context.streetViewReady?'Open the available Street View link. Images may be older than current conditions.':'There is no available Street View link for this point. Choose another inspection point.','#streetview',{stage:'inspect',enabled:!!context.streetViewReady,reason:'Choose another point to find available imagery.'});
    add('display',families?'Return to the original ranked list':'Show Route Family presentation',families?'Show every route in its original rank order. Comparison selections stay recorded.':'Group similar paths into compact families. The best-ranked route stays at the top of each family. Rankings do not change.',null,{kind:'display',displayMode:families?'ranked':'families'});
    if(families){add('family-rules','Adjust which routes count as a family','Change required path overlap and nearby-path distance independently. This changes grouping, not rankings or route paths.','#route-family-overlap');
      if(pair<2)add('compare',pair===1?'Choose a second route to compare':'Choose two routes to compare',pair===1?'One route is already checked. Check a different card to display the pair automatically.':'Use the comparison checkboxes on any two cards, even in different families.','#candidate-list .route-comparison-check input:not(:checked):not(:disabled)',{enabled:(context.comparableRouteCount??state.routes.length)>=2,reason:'Comparison needs two routes with complete saved paths.'});
    }
    if(pair===2){add('comparison-map','Examine the comparison map','Blue and vermilion show the two paths. Thin purple marks exact shared segments. Nearby parallel roads do not count.','#map-work-area');add('end-comparison','End this comparison','Uncheck either card or use End comparison. This does not change your navigation choice.','#end-route-comparison');add('turns',context.turnBubblesVisible?'Hide white turn bubbles':'Show white turn bubbles','Use the turn-bubble button to change their visibility. Route paths stay displayed.','#toggle-turn-bubbles');}
    add('select','Select a route to look at','Click a route card to select it. A comparison checkmark and a recorded navigation choice are separate decisions.','#candidate-list .candidate');
    add('inspect','Look around along the selected route','Open Look around, select a route cell or inspection point, and review available street imagery.',null,{kind:'stage',stage:'inspect',enabled:selected,reason:'Select a route card first.'});
    add('ranking-settings','Adjust how routes are scored','Review the travel-time versus Orange Miles setting. It reranks these routes without buying estimates.','#orange-mile-weight');
    if(!plan){add('evidence-count','Decide how much extra evidence I want','Enter 0 to keep saved evidence. A positive count allows new lookups per INCLUDED route, after exact calculation and your approval.','#pool-ranking-budget');add('evidence-routes','Choose which routes receive extra evidence','Use INCLUDED / EXCLUDED on the cards. Excluded routes stay ranked. Changing inclusion clears any prepared plan.','#candidate-list .route-quota-toggle');add('evidence-plan','Calculate the exact extra lookup count','The free cache check calculates a plan. New paid estimates wait for your separate approval.','#prepare-pool-evolution-ranking',{cost:'Calculation only'});}
    if(chosen){add('phone','Send my recorded route to the phone',context.phoneReady?'Review the OsmAnd handoff control and Android setup before opening navigation.':'The phone handoff is not ready for this route. Review Android setup and the chosen-route message.','#navigate-osmand',{enabled:!!context.phoneReady&&!!context.selectedRouteValid,reason:'Complete the phone handoff prerequisites.'});add('android','Review Android phone setup','Read the companion and OsmAnd setup instructions.','a[href="/android.html"]');}
    else add('choose','Record the selected route as my choice',context.selectedRouteValid?'Open Choose or adjust, review the selected route, then use Choose selected route. Opening the step does not record a choice.':'This selected route has not passed its endpoint check. Generate a valid route before choosing.',null,{kind:'stage',stage:'choose',enabled:selected&&!!context.selectedRouteValid,reason:selected?'This route has not passed its endpoint check.':'Select a route card first.'});
    add('change-trip','Change the trip or search settings','Return to Set the trip. Changing pins, time or exclusions can discard these candidates and require a fresh search.',null,{kind:'stage',stage:'prepare'});save();return result;
  }
  root.RouteDecisionTree={decisionsFor};
  const doc=root.document;if(!doc?.getElementById('guided-decisions'))return;
  let renderKey='',latestTree=null,routeMenu=null,descriptionNumber=0;
  const $=id=>doc.getElementById(id);
  function closeFloatingChoices(returnFocus=false){
    const panel=$('guided-floating-choices');if(!panel)return;
    panel.hidden=true;$('guided-dock-explain')?.setAttribute('aria-expanded','false');
    if(returnFocus)$('guided-dock-explain')?.focus({preventScroll:true});
  }
  function toggleFloatingChoices(){
    const panel=$('guided-floating-choices');if(!panel||root.RouteGuidance?.getMode?.()==='super')return;
    if(!panel.hidden){closeFloatingChoices(true);return;}
    update(root.SurviveDrive?.getState?.()||{},root.SurviveDrive?.getGuidanceContext?.()||{});
    panel.hidden=false;$('guided-dock-explain')?.setAttribute('aria-expanded','true');
    $('guided-floating-title')?.focus({preventScroll:true});
  }
  $('guided-floating-close')?.addEventListener('click',()=>closeFloatingChoices(true));
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('guided-floating-choices')?.hidden&&$('guided-floating-choices')){event.preventDefault();event.stopPropagation();closeFloatingChoices(true);}});
  const guideCard=doc.querySelector('.guide-panel-stack'),floatingPanel=$('guided-floating-choices');
  if(guideCard&&floatingPanel&&typeof root.ResizeObserver==='function')new root.ResizeObserver(()=>floatingPanel.style.setProperty('--guide-card-height',Math.ceil(guideCard.getBoundingClientRect().height)+'px')).observe(guideCard);
  function focusControl(selector){
    const target=doc.querySelector(selector);if(!target)return false;
    if(target.disabled||target.getAttribute('aria-disabled')==='true')return false;
    for(let p=target;p;p=p.parentElement){if(p.localName==='details')p.open=true;if(p.classList.contains('guided-advanced-control'))p.classList.add('guided-choice-revealed');}
    const focus=target.matches('button,input,select,textarea,summary,a[href]')?target:target.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href]')||target;
    if(!focus.matches('button,input,select,textarea,summary,a[href]'))focus.setAttribute('tabindex','-1');
    target.scrollIntoView({behavior:'smooth',block:'center'});focus.focus({preventScroll:true});return true;
  }
  function chooseBranch(id){
    const app=root.SurviveDrive,state=app?.getState?.()||{},context=app?.getGuidanceContext?.()||{};
    const choice=decisionsFor(state,context).choices.find(c=>c.id===id);if(!choice?.enabled)return;
    closeFloatingChoices(true);
    app?.releaseTripMapView?.();
    for(const node of doc.querySelectorAll('.guided-choice-revealed'))node.classList.remove('guided-choice-revealed');
    if(choice.kind==='display')app.setCandidateDisplayMode(choice.displayMode);
    else if(choice.kind==='stage')app.setStage(choice.stage);
    else {if(choice.stage&&choice.stage!==state.stage)app.setStage(choice.stage);if(!focusControl(choice.selector))$('guided-decision-feedback').textContent='That control is not ready yet. Follow the current step and its status message.';}
    root.RouteGuidance?.schedule();
  }
  function cards(tree,compact=false){
    const list=doc.createElement('ul');list.className='guided-choice-list'+(compact?' is-compact':'');
    for(const choice of tree.choices){const item=doc.createElement('li'),button=doc.createElement('button'),description=doc.createElement('p');button.type='button';button.textContent=choice.label;button.disabled=!choice.enabled;button.dataset.decisionId=choice.id;description.id='guided-choice-description-'+(++descriptionNumber);button.setAttribute('aria-describedby',description.id);button.addEventListener('click',()=>chooseBranch(choice.id));description.textContent=choice.description+(choice.enabled?'':' '+choice.reason);item.append(button,description);if(choice.cost){const badge=doc.createElement('small');badge.textContent=choice.cost;item.append(badge);}list.append(item);}
    return list;
  }
  function update(state,context){
    latestTree=decisionsFor(state,context);const key=JSON.stringify(latestTree),guided=root.RouteGuidance?.getMode?.()!=='super';
    $('guided-decisions').hidden=!guided;
    if(!guided)closeFloatingChoices();
    if(key!==renderKey){renderKey=key;$('guided-decision-path').textContent='You are here: '+latestTree.path.join(' → ');$('guided-decision-title').textContent=latestTree.title;$('guided-decision-description').textContent=latestTree.description;$('guided-decision-list').replaceChildren(cards(latestTree));$('guided-decision-feedback').textContent='';}
    if(floatingPanel&&floatingPanel.dataset.key!==key){floatingPanel.dataset.key=key;$('guided-floating-title').textContent=latestTree.title;$('guided-floating-description').textContent=latestTree.description;$('guided-floating-list').replaceChildren(cards(latestTree,true));}
    const ranking=doc.getElementById('primary-ranking');
    if(!routeMenu&&ranking){routeMenu=doc.createElement('section');routeMenu.id='guided-route-decisions';routeMenu.className='guided-route-decisions';ranking.before(routeMenu);}
    if(routeMenu){routeMenu.hidden=!guided||!latestTree.node.startsWith('ranked-');if(routeMenu.dataset.key!==key){routeMenu.dataset.key=key;const title=doc.createElement('h3');title.textContent='Your choices for these ranked routes';const path=doc.createElement('p');path.textContent=latestTree.path.slice(2).join(' → ');const details=doc.createElement('details'),summary=doc.createElement('summary');summary.textContent='Show all choices';const primary=latestTree.choices.filter(c=>['display','compare','comparison-map','inspect','choose','phone','plan'].includes(c.id)),other=latestTree.choices.filter(c=>!primary.includes(c));details.append(summary,cards({...latestTree,choices:other},true));routeMenu.replaceChildren(title,path,cards({...latestTree,choices:primary},true),details);}}
  }
  root.RouteDecisionTree={decisionsFor,update,chooseBranch,toggleFloatingChoices,closeFloatingChoices};
})(typeof window==='undefined'?globalThis:window);
