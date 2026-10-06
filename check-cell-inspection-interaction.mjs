import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const elements=new Map(),layers=[],calls=[],streetViews=[];let now=1000,holdCache=null,holdGeometry=null;
function element(){return{value:'',checked:true,children:[],listeners:{},attributes:{},style:{},classList:{add(){},remove(){},toggle(){}},replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},removeAttribute(k){delete this.attributes[k];},addEventListener(k,fn){this.listeners[k]=fn;},querySelectorAll(){return[];}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
const panes={},map={layers:[],handlers:{},on(k,fn){this.handlers[k]=fn;return this;},setView(){return this;},removeLayer(layer){layer.removed=true;},fitBounds(){},panTo(){},getPane:k=>panes[k],createPane(k){return panes[k]={style:{}};},getContainer(){return{addEventListener(){}};}};
function layer(kind,points,options={}){const item={kind,points,options,layers:[],handlers:{},removed:false,addTo(parent){parent.layers?.push(this);return this;},on(k,fn){this.handlers[k]=fn;return this;},bindTooltip(){return this;},closeTooltip(){this.closed=true;},getBounds(){return{};},setStyle(style){Object.assign(this.options,style);},eachLayer(fn){this.layers.forEach(fn);}};layers.push(item);return item;}
const L={map:()=>map,tileLayer:()=>layer('tiles'),layerGroup:()=>layer('group'),polygon:(p,o)=>layer('cell',p,o),polyline:(p,o)=>layer('line',p,o),circleMarker:(p,o)=>layer('transition',p,o),marker:(p,o)=>layer('marker',p,o),divIcon:o=>o,canvas:()=>({}),DomEvent:{stopPropagation(){}},latLngBounds:p=>p};
const ui={L,crypto:webcrypto,Date:class extends Date{static now(){return now;}},setTimeout(){return 0;},document:{getElementById:get,querySelectorAll:()=>[],createElement:element,createElementNS:()=>element(),addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}},open(url){streetViews.push(url);},fetch:async(path,options)=>{
  calls.push({path,body:JSON.parse(options.body)});
  if(path==='/api/honeycomb/construct'){if(holdGeometry)await holdGeometry.promise;return{ok:true,json:async()=>({complete:true})};}
  if(path==='/api/cache/lookup'){if(holdCache)await holdCache.promise;return{ok:true,json:async()=>({entries:[]})};}
  throw Error('Unexpected request: '+path);
}};ui.window=ui;vm.createContext(ui);vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),ui);
vm.runInContext("setStage=value=>state.stage=value;renderCells=()=>{};renderReviewTarget=()=>{};updateNextAction=()=>{};beginWorking=()=>()=>{};",ui);
const app=ui.SurviveDrive,state=app.getState(),reference=JSON.parse(readFileSync('dist/reference.json','utf8'));
function cell(id,lat,lon){return{cell_id:id,latitude:lat,longitude:lon,grid_version:'test',q:0,r:0,estimate_ppsqft:null,outside_here_distance_m:100,polygon:[[lon-.001,lat-.001],[lon+.001,lat-.001],[lon+.001,lat+.001],[lon-.001,lat+.001]]};}
const a=cell('test-a',40,-90),b=cell('test-b',40.01,-90.01);
state.routes=[{...reference.routes[0],cells:[a,b]}];state.active=0;
ui.SurviveAvm={cellAt(lat,lon){const found=[a,b].find(c=>Math.abs(c.latitude-lat)<.001&&Math.abs(c.longitude-lon)<.001);if(!found)throw Error('No fixture cell at that point');return structuredClone(found);}};
app.drawMap();app.setCellColorOpacity(.85);
const cellLayers=layers.filter(l=>l.avmCellPolygon),pin=()=>layers.filter(l=>!l.removed&&l.kind==='marker'&&l.options.icon.html.includes('inspection-marker')).at(-1),event=pair=>({latlng:{lat:pair[0],lng:pair[1]}});
const normalLines=JSON.stringify(layers.filter(l=>l.kind==='line'||l.kind==='transition').map(l=>l.options)),evidence=JSON.stringify(state.routes),providers=JSON.stringify(state.providerCalls);

await map.handlers.click(event([40,-90]));
assert.deepEqual(Array.from(state.inspection),[40,-90]);assert.ok(pin());assert.equal(cellLayers[0].options.fillOpacity,.20);assert.equal(cellLayers[1].options.fillOpacity,.85);
assert.equal(vm.runInContext('mapInquiryLayer.options.fillOpacity',ui),0);assert.equal(vm.runInContext('mapInquiryLayer.options.fill',ui),false,'no overlapping inspection fill');
assert.equal(app.getMapInquiry().ready,true);assert.equal(calls.length,2);assert.equal(streetViews.length,0);
assert.equal(cellLayers[0].closed,true,'the PPSQFT tooltip closes while the bubble occupies the cell');
const firstPin=pin(),firstInquiry=app.getMapInquiry();
await map.handlers.click(event([40.00003,-90.00005]));
assert.equal(firstPin.removed,true);assert.deepEqual(Array.from(pin().points),[40.00003,-90.00005]);assert.deepEqual(Array.from(firstInquiry.point),[40.00003,-90.00005]);
assert.equal(calls.length,2,'moving the bubble uses no cache or provider request');assert.equal(streetViews.length,0,'rapid nearby cell clicks never open Street View');
map.handlers.dblclick(event([40.00003,-90.00005]));assert.equal(streetViews.length,0,'double-clicking the cell does not open Street View');
pin().handlers.click(event([40.00003,-90.00005]));assert.equal(streetViews.length,1);assert.match(streetViews[0],/viewpoint=40.000030%2C-90.000050/);
app.setCellColorOpacity(.95);assert.equal(cellLayers[0].options.fillOpacity,.20,'selected cell stays at 20 percent regardless of the normal setting');assert.equal(cellLayers[1].options.fillOpacity,.95);
get('cell-note').value='Keep this unfinished review';get('assessment').value='acceptable';
const occupied=pin();await map.handlers.click(event([41,-91]));
assert.equal(state.inspection,null);assert.equal(state.cell,null);assert.equal(state.reviewCell,null);assert.equal(occupied.removed,true);assert.equal(app.getMapInquiry(),null);assert.equal(get('map-avm-panel').hidden,true);assert.equal(get('inspection-coords').value,'');
assert.equal(cellLayers[0].options.fillOpacity,.95);assert.equal(calls.length,2,'outside click dismisses instead of querying another cell');assert.ok(Object.values(state.reviewDrafts).some(draft=>draft.text==='Keep this unfinished review'));
assert.equal(vm.runInContext('inspectionOccupiesMapCell(state.routes[0].cells[0].polygon)',ui),false,'PPSQFT tooltip suppression ends when the bubble is dismissed');

await map.handlers.click(event([40,-90]));await map.handlers.click(event([40.01,-90.01]));
assert.equal(state.inspection,null,'clicking a different cell dismisses the current bubble');assert.equal(cellLayers[0].options.fillOpacity,.95);assert.equal(calls.length,4);
await map.handlers.click(event([40.01,-90.01]));assert.equal(cellLayers[1].options.fillOpacity,.20);assert.ok(pin());
state.busy=true;await map.handlers.click(event([41,-91]));assert.ok(state.inspection,'an approved active request keeps its inspection target fixed');state.busy=false;app.clearInspection();

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
holdCache=deferred();const pending=app.handleMapClick([40,-90]);
for(let i=0;i<12&&!calls.at(-1)?.path.endsWith('/cache/lookup');i++)await Promise.resolve();
assert.equal(calls.at(-1).path,'/api/cache/lookup');await map.handlers.click(event([41,-91]));holdCache.resolve();await pending;holdCache=null;
assert.equal(state.inspection,null);assert.equal(app.getMapInquiry(),null);assert.equal(get('map-avm-panel').hidden,true,'a late cache response cannot restore dismissed inspection');assert.equal(cellLayers[0].options.fillOpacity,.95);
holdGeometry=deferred();const before=calls.length,pendingGeometry=app.handleMapClick([40,-90]);await map.handlers.click(event([41,-91]));holdGeometry.resolve();await pendingGeometry;holdGeometry=null;
assert.equal(calls.length,before+1,'dismissal before geometry returns cancels the subsequent cache check');assert.equal(state.inspection,null);
assert.equal(JSON.stringify(state.routes),evidence);assert.equal(JSON.stringify(state.providerCalls),providers);assert.ok(calls.every(c=>!c.path.includes('/providers/')));assert.equal(JSON.stringify(layers.filter(l=>l.kind==='line'||l.kind==='transition').map(l=>l.options)),normalLines);
console.log('Passed cell click, exact 20 percent fill, same-cell bubble movement, bubble-only Street View, outside/different-cell dismissal, opacity restoration, draft retention, pending-response cancellation, busy protection, unchanged route styling/evidence, and zero provider requests.');
