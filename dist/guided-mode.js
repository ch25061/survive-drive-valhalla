(function (root) {
  'use strict';
  const KEY='route-screwtiny.experience.v1';
  const stages={
    prepare:{number:1,title:'Where are you going?',description:'Place your start and destination using addresses or the map. Check both pins. Then review the suggested Route Gates — the approach points used to find alternatives.',why:'GO looks for roads around both trip ends. After both gate sets are ready, the prepared route batch starts automatically when Valhalla is connected. Limited gate sets need your decision.'},
    search:{number:2,title:'Let the route search finish',description:'The search tries the reviewed gate combinations. Watch the real progress below. If the connection fails, read the message before deciding to retry.',why:'Your route-time limit and Exclusion Zones apply to this search. No live traffic is included. Hiding zones on the map only hides their drawing.'},
    evaluate:{number:3,title:'Understand your route choices',description:'First, the app checks saved evidence for the whole route pool. Review the ranking and known coverage. For comparison, show route families and check two cards; their map appears automatically.',why:'Orange is a property-value signal, not a safety verdict. Grey means unknown. More evidence is optional after the required pool screen; new lookups need a reviewed plan and your approval.'},
    inspect:{number:4,title:'Take a closer look',description:'Select a route cell or an inspection point, then open available Street View imagery. Use what you see and the evidence coverage to make your own assessment.',why:'Pictures and property values cannot promise safety. Missing or failed lookups remain unknown. You can keep reviewing without requesting more evidence.'},
    choose:{number:5,title:'Choose the route you want',description:'Check the selected route, record your choice, then use the OsmAnd handoff. Android setup explains the companion and navigation steps.',why:'Checking two cards compares routes. Selecting a route and recording your choice are separate decisions. Export this session to keep your work before closing the tab.'}
  };
  function guidanceFor(state,instruction){
    const stage=stages[state?.stage]?state.stage:'prepare',base=stages[stage];
    const busy=!!state?.busy||!!state?.gateGenerationPending||!!state?.catalogBusy?.start||!!state?.catalogBusy?.destination;
    return {...base,stage,next:busy?'Work is in progress. Follow the progress below; no extra click is needed.':instruction||({prepare:'Enter your start address and ZIP, or use Set start on map.',search:'Review the route-search status below.',evaluate:'Review the whole-pool screening status below.',inspect:'Choose a cell on the map to inspect.',choose:'Review the selected route and record your choice.'})[stage],busy};
  }
  root.RouteGuidance={guidanceFor};
  if(!root.document)return;
  const doc=root.document,$=id=>doc.getElementById(id);
  if(!$('mode-guided'))return;
  let mode='guided',advanced=false,scheduled=false,lastFocus=null;
  try{if(root.localStorage.getItem(KEY)==='super')mode='super';}catch{}
  const setText=(id,text)=>{if($(id).textContent!==text)$(id).textContent=text;};
  function classify(){
    // Presentation only. Mandatory decisions, budgets, plan summaries and approval controls stay visible.
    const selectors=['#trip-endpoints label:has(> #origin-name)','#trip-endpoints label:has(> #destination-name)','#trip-endpoints label:has(> #origin)','#trip-endpoints label:has(> #destination)','#trip-form > .form-pair','#trip-form > .form-pair + .hint','#avoid-settings','#shotgun-settings > .form-pair','#shotgun-radius-help','#shotgun-settings > label','#here-approval-panel details:has(#request-preview)','#download-request','#download-response','#here-approval-panel > details:has(#paste-valhalla-request)','#download-example','.color-scale-setting','.route-line-color-picker','#route-line-color-settings','#pool-ranking-baseline-control','label:has(> #pool-ranking-cull-percent)','#pool-ranking-cull-help','#pool-ranking-cull-preview','#pool-screening-route-allocation-details','#pool-screening-ledger-details','#pool-screening-plan-details details:has(#pool-screening-plan)','#route-family-parameters','.round-history'];
    for(const selector of selectors)for(const el of doc.querySelectorAll(selector))el.classList.add('guided-advanced-control');
    for(const el of doc.querySelectorAll('.guided-advanced-control'))el.classList.toggle('guided-required-control',!!el.querySelector('.next-action-target')||el.classList.contains('next-action-target'));
  }
  function update(){
    scheduled=false;
    const state=root.SurviveDrive?.getState?.()||{},cue=$('next-action');
    const model=guidanceFor(state,cue&&!cue.hidden?$('next-action-text')?.textContent:'');
    doc.body.dataset.guidedStage=model.stage;
    const pointReady=id=>{const parts=String($(id)?.value||'').split(',');return parts.length===2&&parts.every(part=>part.trim()&&Number.isFinite(Number(part)))&&Math.abs(Number(parts[0]))<=90&&Math.abs(Number(parts[1]))<=180;};
    doc.body.dataset.guidedTripReady=String(pointReady('origin')&&pointReady('destination'));
    classify();setText('guided-step','STEP '+model.number+' OF 5');setText('guided-title',model.title);setText('guided-description',model.description);setText('guided-next',model.next);setText('guided-why',model.why);
    const target=doc.querySelector('.next-action-target');
    $('guided-show-next').disabled=model.busy||!target;
    $('guided-show-next').hidden=model.busy;
  }
  function schedule(){if(scheduled)return;scheduled=true;root.queueMicrotask(update);}
  function setMode(value){
    mode=value==='super'?'super':'guided';
    doc.body.dataset.experienceMode=mode;doc.body.dataset.guidedAdvanced=String(advanced);
    $('mode-guided').setAttribute('aria-pressed',String(mode==='guided'));
    $('mode-super').setAttribute('aria-pressed',String(mode==='super'));
    $('guided-coach').hidden=mode!=='guided';
    for(const details of doc.querySelectorAll('.guided-explainer'))details.open=mode==='super';
    setText('experience-description',mode==='guided'?'Guided Mode explains one decision at a time. Switch modes whenever you like.':'Super User Mode shows every control. Your trip, evidence, and selections are retained.');
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
    const target=doc.querySelector('.next-action-target');if(!target)return;
    for(let parent=target;parent;parent=parent.parentElement)if(parent.localName==='details')parent.open=true;
    const focus=target.matches('button,input,select,textarea,summary,a[href]')?target:target.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary')||target;
    if(!focus.hasAttribute('tabindex')&&!focus.matches('button,input,select,textarea,summary,a[href]'))focus.setAttribute('tabindex','-1');
    target.scrollIntoView({behavior:'smooth',block:'center'});focus.focus({preventScroll:true});
  });
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
  // Input listeners also cover address editing; no routing or approval handler is called here.
  doc.addEventListener('input',event=>{if(!event.target.closest('#guided-lesson'))schedule();});
  doc.addEventListener('change',event=>{if(!event.target.closest('#guided-lesson'))schedule();});
  root.RouteGuidance={guidanceFor,schedule,update,setMode,getMode:()=>mode};
  resetLesson();setMode(mode);
})(typeof window==='undefined'?globalThis:window);
