import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const elements=new Map(),fitCalls=[];
function element(){return{value:'',hidden:false,disabled:false,textContent:'',addEventListener(){},classList:{add(){},remove(){},toggle(){}},replaceChildren(){},append(){},setAttribute(){},removeAttribute(){}};}
const ui={document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,querySelectorAll:()=>[]},fetch(){throw Error('route focus tests must stay offline');}};ui.window=ui;
const map={layers:[],on(){return this;},setView(){return this;},removeLayer(layer){layer.removed=true;},getPane(){return{};},createPane(){return{style:{}};},fitBounds(bounds,options){fitCalls.push({bounds,options});}};
function layer(type,points){return{type,points,layers:[],addTo(parent){parent.layers?.push(this);return this;},getBounds(){return{routeBounds:true,points:this.points};},on(){return this;},bindTooltip(){return this;},eachLayer(){}};}
ui.L={map:()=>map,tileLayer:()=>layer('tiles'),layerGroup:()=>layer('group'),polygon:(points)=>layer('polygon',points),polyline:(points)=>layer('route',points),latLngBounds:points=>({redBounds:true,points}),DomEvent:{stopPropagation(){}}};
vm.createContext(ui);vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),ui);
const {worstKnownRedCluster}=ui.SurviveDrive;
const polygon=(x)=>[[x,0],[x+0.01,0],[x+0.01,0.01],[x,0.01]];
const cell=(q,r,exposure,estimate,extra={})=>({cell_id:`CHI1K-V1-Q${q>=0?'+':''}${q}-R${r>=0?'+':''}${r}`,outside_here_distance_m:exposure,estimate_ppsqft:estimate,polygon:polygon(q),...extra});
const route={cells:[
  cell(0,0,350,80),cell(1,0,350,70),
  cell(8,8,600,5), // darkest single cell, but less total Red exposure than the pair
  cell(2,0,900,1,{outside_here_distance_m:0}), // highway authority does not count
  cell(9,9,1000,null),
]};
const focus=worstKnownRedCluster(route,100);
assert.deepEqual(Array.from(focus,c=>c.cell_id),['CHI1K-V1-Q+0-R+0','CHI1K-V1-Q+1-R+0'],
  'adjacent known Red cells form a cluster and total known overland exposure determines the worst area');
assert.equal(worstKnownRedCluster({cells:[cell(1,1,100,null)]},100).length,0,
  'unknown estimates do not count as known Red cells');
assert.equal(worstKnownRedCluster({cells:[cell(1,1,100,100)]},100).length,0,
  'a value equal to the Red threshold is not Red');
assert.equal(worstKnownRedCluster({cells:[cell(1,1,0,1)]},100).length,0,
  'highway-only cells do not determine the route focus');

// Execute route selection itself so both route changes and a deliberate click
// on the already-selected candidate prove that they request red-area focus.
const selectRouteSource=source.match(/function selectRoute\(index[\s\S]*?\n\}/)?.[0];assert.ok(selectRouteSource,'route selection function remains available');
const selectState={routes:[{id:'a',cells:[]},{id:'b',cells:[]}],active:0,busy:false,selectedRoutePopupOpen:false},focusRequests=[];
const selectHarness={state:selectState,current:()=>selectState.routes[selectState.active],inspectionMarker:null,map:null,dismissMapAvm(){},rememberReviewDraft(){},resetAvmReview(){},updateStreetView(){},
  $(){return element();},routeGateLabel:()=>'',renderCandidates(){},renderMetrics(){},drawMap:options=>focusRequests.push(options),
  renderCells(){},renderChoice(){},renderEvaluationFlow(){},renderReviewTarget(){},updateNextAction(){}};
vm.createContext(selectHarness);vm.runInContext(selectRouteSource+';globalThis.selectRoute=selectRoute;',selectHarness);
assert.equal(selectHarness.selectRoute(1,{source:'candidate-card'}),true);
assert.equal(focusRequests.at(-1).focusRed,true,'changing the selected candidate requests red focus');
assert.equal(selectHarness.selectRoute(1,{source:'candidate-card'}),true);
assert.equal(focusRequests.at(-1).focusRed,true,'clicking the already-selected candidate refocuses its Red area');
selectHarness.selectRoute(1,{source:'programmatic'});
assert.equal(focusRequests.at(-1).focusRed,false,'same-route programmatic refresh does not steal the current map view');

// Exercise real Leaflet map-fit behavior: selected red polygons are bounded,
// routes without known Red cells fall back to the whole route, and fit-map's
// existing drawMap fitBounds mode still fits the full route.
const app=ui.SurviveDrive,state=app.getState(),selectedRoute={geometry:[[0,0],[5,5]],cells:[cell(0,0,350,80),cell(1,0,350,70),cell(8,8,600,5)]};
state.routes=[selectedRoute];state.active=0;app.drawMap({focusRed:true});
assert.equal(fitCalls.at(-1).bounds.redBounds,true,'selected-route focus fits cell bounds');
assert.equal(JSON.stringify(fitCalls.at(-1).bounds.points),JSON.stringify(selectedRoute.cells.slice(0,2).flatMap(c=>c.polygon.map(p=>[p[1],p[0]]))),
  'map bounds contain only the highest-exposure Red cluster');
const routeOnly={geometry:[[1,2],[3,4]],cells:[cell(1,1,100,null)]};state.routes=[routeOnly];app.drawMap({focusRed:true});
assert.equal(fitCalls.at(-1).bounds.routeBounds,true,'routes without known Red values fit the whole route');
app.drawMap({fitBounds:true});assert.equal(fitCalls.at(-1).bounds.routeBounds,true,'Show entire route still fits the whole route');

console.log('Passed route red-cell focus: deterministic adjacent-cell clusters ranked by known Red overland exposure, route-selection and re-selection focus behavior, map bounds for Red and no-Red routes, retained full-route fit, and no provider calls.');
