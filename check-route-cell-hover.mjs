import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const elements=new Map(),events={},layers=[];let now=1000,networkCalls=0,streetViews=0,groupCreates=0,fitBoundsCalls=0,knownCacheValue=null;
function element(){const attributes={},classes=new Set();return{value:'',children:[],listeners:{},attributes,disabled:false,hidden:false,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);},contains:c=>classes.has(c)},replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},setAttribute(k,v){attributes[k]=v;},getAttribute(k){return attributes[k]??null;},removeAttribute(k){delete attributes[k];},addEventListener(k,fn){this.listeners[k]=fn;},scrollIntoView(){},focus(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
const mapContainer={listeners:{},addEventListener(k,fn){this.listeners[k]=fn;}},panes={},map={layers:[],handlers:{},on(k,fn){this.handlers[k]=fn;return this;},setView(){return this;},fitBounds(){fitBoundsCalls++;},getBounds(){return{getSouth:()=>40,getNorth:()=>42,getWest:()=>-88,getEast:()=>-86};},panTo(){},removeLayer(layer){layer.removed=true;},getPane:k=>panes[k],createPane(k){return panes[k]={style:{}};},getContainer(){return mapContainer;},mouseEventToLatLng(event){return event.latlng;}};
function layer(type,point,options={}){const result={type,point,options,handlers:{},removed:false,tooltipOpen:false,on(k,fn){this.handlers[k]=fn;return this;},addTo(parent){parent.layers?.push(this);return this;},bindTooltip(value,options){this.tooltip=value;this.tooltipOptions=options;this.tooltipObject={setLatLng(point){this.point=point;}};return this;},getTooltip(){return this.tooltipObject;},openTooltip(point){this.tooltipOpen=true;this.tooltipObject?.setLatLng(point);return this;},closeTooltip(){this.tooltipOpen=false;return this;},isTooltipOpen(){return this.tooltipOpen;},getBounds(){return{};},getLatLng(){return{lat:this.point[0],lng:this.point[1]};},setStyle(){},layers:[],eachLayer(fn){this.layers.forEach(fn);}};layers.push(result);return result;}
const L={map:()=>map,tileLayer:()=>layer('tiles'),layerGroup:()=>{groupCreates++;return layer('group');},polygon:(p,o)=>layer('cell',p,o),polyline:(p,o)=>layer('route',p,o),circleMarker:(p,o)=>layer('authority',p,o),marker:(p,o)=>layer('marker',p,o),divIcon:o=>o,canvas:()=>({}),DomEvent:{stopPropagation(){}},latLngBounds:points=>points};
const ui={L,crypto:webcrypto,Date:class extends Date{static now(){return now;}},document:{getElementById:get,querySelectorAll:()=>[],createElement:element,createElementNS:element,addEventListener(k,fn){events[k]=fn;}},fetch(){networkCalls++;throw Error('Map picking must not send requests.');},open(){streetViews++;}};ui.window=ui;vm.createContext(ui);vm.runInContext(readFileSync('dist/route-avm.js','utf8'),ui);vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),ui);
const app=ui.SurviveDrive,state=app.getState(),reference=JSON.parse(readFileSync('dist/reference.json','utf8'));state.routes=reference.routes;state.active=0;

app.drawMap();
const multiRangeRoute={...reference.routes[0],authority_ranges:[[0,4],[5,8]],authority_offsets:null};state.routes=[multiRangeRoute];
let markerStart=layers.length;app.drawMap();
const transitionMarkers=layers.slice(markerStart).filter(l=>l.type==='authority'&&['#fff','#000'].includes(l.options.fillColor));
const exitMarkers=transitionMarkers.filter(l=>l.tooltip.includes('exit to overland streets'));
const entryMarkers=transitionMarkers.filter(l=>l.tooltip.includes('entry / reentry'));
for(const offset of [4,8])assert.ok(exitMarkers.some(l=>l.point[0]===multiRangeRoute.geometry[offset][1]&&l.point[1]===multiRangeRoute.geometry[offset][0]));
for(const offset of [0,5])assert.ok(entryMarkers.some(l=>l.point[0]===multiRangeRoute.geometry[offset][1]&&l.point[1]===multiRangeRoute.geometry[offset][0]));
assert.equal(exitMarkers.length,2);
assert.equal(entryMarkers.length,2);
assert.ok(entryMarkers.every(l=>l.options.fillColor==='#fff'&&l.options.color==='#111'));
assert.ok(exitMarkers.every(l=>l.options.fillColor==='#000'&&l.options.color==='#fff'));
assert.ok(transitionMarkers.every(l=>l.options.radius===5&&l.options.weight===1.5&&l.options.fillOpacity===1));
ui.L=null;app.drawMap();
const fallbackMarkers=get('fallback-svg').children.filter(node=>/^H[12] (IN|OUT)$/.test(node.attributes['aria-label']??''));
assert.equal(fallbackMarkers.length,4);
assert.ok(fallbackMarkers.every(node=>node.attributes.r==='5'&&node.attributes.fill===(node.attributes['aria-label'].endsWith('IN')?'#fff':'#000')&&node.attributes.stroke===(node.attributes['aria-label'].endsWith('IN')?'#111':'#fff')));
ui.L=L;
state.routes=reference.routes;const routeCellStart=layers.length;app.drawMap();const hoverCell=layers.slice(routeCellStart).find(l=>l.type==='cell'&&l.options.weight===2&&l.tooltip?.endsWith(' PPSQFT')),drawnRoute=layers.slice(routeCellStart).find(l=>l.type==='route');assert.ok(hoverCell,'route-containing AVM cells are interactive map targets');assert.equal(hoverCell.options.interactive,true);assert.equal(hoverCell.tooltipOptions.sticky,true,'the AVM value tooltip follows the pointer across the full cell');assert.equal(hoverCell.tooltipOptions.className,'avm-cell-value-tooltip');assert.equal(drawnRoute.options.interactive,false,'the route stroke cannot intercept cell hover');assert.equal(typeof mapContainer.listeners.mousemove,'function','the fallback hover bridge is attached to the map container');const ring=hoverCell.point,latlng={lat:ring.reduce((sum,p)=>sum+p[0],0)/ring.length,lng:ring.reduce((sum,p)=>sum+p[1],0)/ring.length};mapContainer.listeners.mousemove({target:{className:'occluding-exclusion-zone'},latlng});assert.equal(hoverCell.tooltipOpen,true,'a route cell PPSQFT tooltip opens even when another interactive map overlay is on top');

console.log('Passed route-cell AVM hover-card and pointer-through checks.');
