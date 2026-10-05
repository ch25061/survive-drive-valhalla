import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
assert.match(source,/button\.addEventListener\('click',\(\)=>handleCandidateCardClick\(i\)\)/,
  'pointer and native keyboard clicks must share the route-card activation handler');
assert.doesNotMatch(source,/selectRoute\(i,\{openFollowUp:true\}\)/,
  'selecting another card must not open the selected-route dialogue');
assert.match(source,/function selectRoute\(index[\s\S]*?renderCandidates\(\);renderMetrics\(\);drawMap\(\);/,
  'selecting a different route must refresh its card, details, metrics, and map');
assert.match(source,/function closeSelectedRoutePopup\(\)\{state\.selectedRoutePopupOpen=false;\$\('selected-route-popup'\)\.hidden=true;/,
  'the explicit close action must keep closing the dialogue');

const elements=new Map();
function element(){return{addEventListener(){},classList:{add(){},remove(){},toggle(){}},replaceChildren(){},append(){},setAttribute(){},removeAttribute(){}};}
const ui={document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}},fetch(){throw Error('route selection tests must stay offline');}};ui.window=ui;
vm.createContext(ui);vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),ui);
const app=ui.SurviveDrive,state=app.getState();
const routes=[{id:'alpha',name:'Alpha',cells:[]},{id:'beta',name:'Beta',cells:[]}];state.routes=routes;state.active=0;
state.poolScreening.results=[{route_id:'alpha',rank:1},{route_id:'beta',rank:2}];
assert.deepEqual(Array.from(app.rankedCandidateCards(),card=>[card.route.id,card.index]),[['alpha',0],['beta',1]]);

// Known Red miles lead; Red Percent and Known Coverage resolve ties before returned travel time.
state.redThresholdPpsqft=250;
const evidenceCell=(id,distance,value)=>({cell_id:id,outside_here_distance_m:distance,estimate_ppsqft:value});
const knownMilesFirst=[
  {id:'few-known-red',name:'Few known Red miles, large unknown gap',duration_s:1800,cells:[evidenceCell('few-red',50,200),evidenceCell('few-unknown',1000,null)]},
  {id:'more-known-red',name:'More known Red miles, complete',duration_s:300,cells:[evidenceCell('more-red-primary',100,200),evidenceCell('more-green-primary',900,300)]}
];
const knownMilesRanks=new Map(ui.rankPoolResults(knownMilesFirst,null,[]).map(row=>[row.route_id,row.rank]));
assert.ok(knownMilesRanks.get('few-known-red')<knownMilesRanks.get('more-known-red'),'Known Red Miles Under stays primary even when unknown miles would make the old ceiling larger');
const tieRoutes=[
  {id:'slow',name:'A slow route',duration_s:1200,cells:[evidenceCell('slow-red',100,200),evidenceCell('slow-green',100,300)]},
  {id:'fast',name:'Z fast route',duration_s:600,cells:[evidenceCell('fast-red',100,200),evidenceCell('fast-green',100,300),evidenceCell('fast-unknown',100,null)]},
  {id:'higher-value',name:'Higher value, longer trip',duration_s:1800,cells:[evidenceCell('higher-red',100,200),evidenceCell('higher-green',100,500)]},
  {id:'least-red',name:'Least Red',duration_s:1800,cells:[evidenceCell('least-green',200,300)]},
  {id:'no-time',name:'No travel time',duration_s:null,cells:[evidenceCell('untimed-red',100,200),evidenceCell('untimed-green',100,300)]},
  {id:'no-evidence',name:'No known AVM evidence',duration_s:300,cells:[evidenceCell('unknown-only',100,null)]}
];
const tieResults=ui.rankPoolResults(tieRoutes,null,[]),tieRanks=new Map(tieResults.map(row=>[row.route_id,row.rank]));
assert.deepEqual(Array.from(['least-red','slow','higher-value','no-time','fast'],id=>tieRanks.get(id)),[1,2,3,4,5]);
assert.equal(tieRanks.get('no-evidence'),null,'routes with no known AVM evidence remain unranked instead of receiving a zero-mile score');
assert.ok(tieRanks.get('slow')<tieRanks.get('fast'),'equal Known Red Miles Under and Red Percent use higher Known Coverage before travel time');
state.routes=tieRoutes;state.poolScreening.results=tieResults;
assert.deepEqual(Array.from(app.rankedCandidateCards(),card=>card.route.id),['least-red','slow','higher-value','no-time','fast','no-evidence']);
assert.equal(tieResults.find(row=>row.route_id==='fast').red_distance_m,100,'the primary score remains known Red miles even when unknown miles are present');
assert.equal(tieResults.find(row=>row.route_id==='fast').unknown_distance_m,100,'unknown exposure remains available as coverage context');

const detourRoutes=[
  {id:'short',name:'Short known route',duration_s:500,cells:[evidenceCell('short-red',100,200),evidenceCell('short-green',900,300)]},
  {id:'detour',name:'Long non-Red detour',duration_s:600,cells:[evidenceCell('detour-red',100,200),evidenceCell('detour-green',4900,300)]},
  {id:'more-red',name:'More Red, faster',duration_s:100,cells:[evidenceCell('more-red-cell',101,200),evidenceCell('more-green-cell',999,300)]},
  {id:'partial-short',name:'Partial route',duration_s:700,cells:[evidenceCell('partial-red',50,200),evidenceCell('partial-unknown',50,null),evidenceCell('partial-known-green',100,300)]},
  {id:'partial-detour',name:'Partial route with green detour',duration_s:800,cells:[evidenceCell('partial-detour-red',50,200),evidenceCell('partial-detour-unknown',50,null),evidenceCell('partial-detour-green',500,300)]}
];
const detourResults=ui.rankPoolResults(detourRoutes,null,[]),detourRanks=new Map(detourResults.map(row=>[row.route_id,row.rank]));
assert.ok(detourRanks.get('detour')<detourRanks.get('short'),'Red Percent breaks equal known-Red-mile ties before travel time');
assert.ok(detourRanks.get('more-red')>detourRanks.get('detour'),'one more known Red meter is worse even when the route is much faster');
assert.equal(detourResults.find(row=>row.route_id==='partial-short').red_distance_m,50);
assert.equal(detourResults.find(row=>row.route_id==='partial-detour').red_distance_m,50);
assert.ok(detourRanks.get('partial-detour')<detourRanks.get('partial-short'),'lower Red Percent breaks equal known-Red-mile ties on partial routes');
state.routes=routes;

// A cutoff-driven rerank can reorder the visible cards; their stored indices
// still identify the original route objects, so selection never follows rank.
state.redThresholdPpsqft=200;state.poolScreening.status='refreshed_after_cutoff_change';
state.poolScreening.results=[{route_id:'beta',rank:1,screening_status:'reranked at $200'},{route_id:'alpha',rank:2,screening_status:'reranked at $200'}];
const cardsAfterCutoff=app.rankedCandidateCards();
assert.deepEqual(Array.from(cardsAfterCutoff,card=>[card.route.id,card.index]),[['beta',1],['alpha',0]]);
// A subsequent evidence rerank is also consumed by the same route-identity sort.
state.poolScreening.status='refreshed_after_selected_avm';
state.poolScreening.results=[{route_id:'alpha',rank:1,screening_status:'reranked after AVM'},{route_id:'beta',rank:2,screening_status:'reranked after AVM'}];
assert.deepEqual(Array.from(app.rankedCandidateCards(),card=>[card.route.id,card.index]),[['alpha',0],['beta',1]]);

const handler=source.match(/function handleCandidateCardClick\(index\)\{[\s\S]*?\n\}/)?.[0];assert.ok(handler,'route-card activation handler must remain independently testable');
const clickState={routes,active:0,busy:false,selectedRoutePopupOpen:false,candidateCardArmedRouteId:null};let visibleRoute='alpha',mapRoute='alpha',popupVisible=false,focuses=0,updates=0,ready=true;
const closeButton={focus(){focuses++;}};
const harness={state:clickState,poolScreenReady:()=>ready,
  selectRoute(index,options={}){if(options.source!=='candidate-card')clickState.candidateCardArmedRouteId=null;clickState.active=index;clickState.selectedRoutePopupOpen=false;visibleRoute=routes[index].id;mapRoute=routes[index].id;popupVisible=false;return true;},
  renderEvaluationFlow(){popupVisible=clickState.selectedRoutePopupOpen;},
  $(id){return id==='close-selected-route-popup'?closeButton:{hidden:true};},updateNextAction(){updates++;}};
vm.createContext(harness);vm.runInContext(handler+';globalThis.activate=handleCandidateCardClick;',harness);

assert.equal(harness.activate(cardsAfterCutoff[0].index),true,'first click selects the different route');
assert.equal(clickState.active,1);assert.equal(visibleRoute,'beta');assert.equal(mapRoute,'beta');
assert.equal(popupVisible,false,'first click shows route details without the additional dialogue');
assert.equal(harness.activate(1),true,'second deliberate activation opens follow-up');
assert.equal(popupVisible,true);assert.equal(focuses,1);assert.equal(updates,1);
// A route selected by startup or another workflow still gets one deliberate
// card click to confirm/display it before the second click opens follow-up.
clickState.candidateCardArmedRouteId=null;clickState.selectedRoutePopupOpen=false;popupVisible=false;
assert.equal(harness.activate(1),true);assert.equal(popupVisible,false,'first click on an already-active route remains closed');
assert.equal(harness.activate(1),true);assert.equal(popupVisible,true,'second click on an already-active route opens follow-up');
// Native keyboard activation dispatches the same button click handler (detail 0).
clickState.selectedRoutePopupOpen=false;popupVisible=false;
assert.equal(harness.activate(1),true);assert.equal(popupVisible,true,'keyboard activation opens the same selected-route follow-up');
ready=false;clickState.selectedRoutePopupOpen=false;popupVisible=false;
assert.equal(harness.activate(1),false,'follow-up remains gated until the whole-pool screen is ready');assert.equal(popupVisible,false);
ready=true;clickState.busy=true;assert.equal(harness.activate(0),false,'busy state suppresses card activation');assert.equal(clickState.active,1);

console.log('Passed ranked route-card activation: first click selects and updates the route/map, second click opens follow-up, explicit close contract, cutoff and evidence reranks, native keyboard click semantics, readiness gating, and busy suppression. No provider calls.');
