import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const nodes=new Map(),events={},layers=[];
let mapTop=160,networkCalls=0,scrollByCalls=0;
function element(id=''){
  const attributes={},classes=new Set();
  return {
    id,value:'',textContent:'',children:[],listeners:{},attributes,disabled:false,hidden:false,
    checked:false,dataset:{},style:{},parentElement:null,localName:'div',open:false,
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);},contains:c=>classes.has(c)},
    replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},before(node){node.parentElement=this.parentElement;},
    setAttribute(k,v){attributes[k]=String(v);},getAttribute(k){return attributes[k]??null;},removeAttribute(k){delete attributes[k];},hasAttribute(k){return k in attributes;},
    addEventListener(k,fn){this.listeners[k]=fn;},getBoundingClientRect(){return id==='map'?{top:mapTop,bottom:mapTop+480,left:0,right:480,height:480,width:480}:{top:20,bottom:40,left:0,right:100,height:20,width:100};},
    scrollIntoView(){this.scrollIntoViewCalls=(this.scrollIntoViewCalls||0)+1;},focus(){this.focused=true;},matches(){return false;},closest(){return null;},querySelector(){return null;},
  };
}
const $=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
const map={layers:[],handlers:{},on(name,fn){this.handlers[name]=fn;return this;},setView(point,zoom){this.view={point,zoom};return this;},getZoom(){return 9;},fitBounds(bounds){this.bounds=bounds;},panTo(point){this.pan=point;},removeLayer(layer){layer.removed=true;},getPane(name){return this.panes?.[name];},createPane(name){this.panes??={};return this.panes[name]={style:{}};}};
function layer(type,point,options={}){const result={type,point,options,handlers:{},removed:false,layers:[],on(name,fn){this.handlers[name]=fn;return this;},addTo(parent){parent.layers?.push(this);return this;},bindTooltip(value){this.tooltip=value;return this;},getBounds(){return{};},getLatLng(){return{lat:this.point[0],lng:this.point[1]};},setStyle(){},eachLayer(fn){this.layers.forEach(fn);}};layers.push(result);return result;}
const L={map:()=>map,tileLayer:()=>layer('tiles'),layerGroup:()=>layer('group'),polygon:(p,o)=>layer('cell',p,o),polyline:(p,o)=>layer('route',p,o),circleMarker:(p,o)=>layer('authority',p,o),marker:(p,o)=>layer('marker',p,o),divIcon:o=>o,canvas:()=>({}),DomEvent:{stopPropagation(){}}};
const created=[];
const document={body:$('body'),getElementById:$,querySelector(selector){if(selector==='.next-action-target')return null;if(selector==='#map')return $('map');if(selector.startsWith('#'))return $(selector.slice(1).split(/[ >]/)[0]);return null;},querySelectorAll(){return[];},createElement:()=>{const node=element();created.push(node);return node;},createElementNS:()=>{const node=element();created.push(node);return node;},addEventListener(name,fn){(events['document:'+name]??=[]).push(fn);}};
const state={stage:'prepare',routes:[],active:0,notes:{},providerCalls:{HERE:0,RentCast:0,Valhalla:0},catalogFaults:{start:false,destination:false},poolScreening:{results:[]}};
const env={L,crypto:webcrypto,Date,Event:class{constructor(type){this.type=type;}},setTimeout,clearTimeout,queueMicrotask,requestAnimationFrame:fn=>fn(),document,innerHeight:800,innerWidth:1200,
  addEventListener(name,fn){events[name]=fn;},removeEventListener(){},scrollBy({top}){scrollByCalls++;mapTop-=top;},dispatchEvent(){},matchMedia:()=>({matches:true}),
  fetch(){networkCalls++;throw Error('No provider or network calls are permitted in this check.');},
};env.window=env;
vm.createContext(env);
for(const file of ['shotgun-gates.js','app.js'])vm.runInContext(readFileSync('dist/'+file,'utf8').replace(/\ninit\(\);\s*$/,''),env);
vm.runInContext('bindGuidedFocusRespect()',env);
const app=env.SurviveDrive;
for(const [id,value]of Object.entries({origin:'41.9,-87.7',destination:'41.8,-87.6','origin-name':'Start','destination-name':'Destination','departure-mode':'any','candidate-limit':'5','routing-mode':'fast','avm-cap':'0'}))$(id).value=value;
app.bindTripPointControls();app.drawMap();
// Load the actual guided module against the same app state and scroll geometry.
vm.runInContext(readFileSync('dist/guided-mode.js','utf8'),env);
const guidance=env.RouteGuidance,initialView=JSON.stringify({view:map.view,bounds:map.bounds,pan:map.pan});
const mapElement=$('map');
assert.equal(app.armMapPick('destination'),true);
assert.equal(app.getGuidanceContext().mapPlacementHeld,true);
assert.equal(mapElement.scrollIntoViewCalls||0,0,'an already visible map does not need to scroll to begin placement');
map.handlers.click({latlng:{lat:41.812345678,lng:-87.612345678}});
assert.equal($('destination').value,'41.8123457,-87.6123457');
assert.equal($('destination-name').value,'Map-selected destination');
const destinationPin=layers.filter(item=>!item.removed&&item.type==='marker'&&item.options.icon?.html?.includes('trip-pin-destination')).at(-1);
assert.ok(destinationPin,'the destination pin is drawn');
assert.deepEqual(Array.from(destinationPin.point),[41.8123457,-87.6123457],'D is placed at the actual rounded click coordinates');
assert.equal(JSON.stringify({view:map.view,bounds:map.bounds,pan:map.pan}),initialView,'placing D does not change Leaflet zoom or map view');
assert.equal(app.getGuidanceContext().mapPlacementHeld,true,'the placement hold stays active after the click');
assert.equal(app.getGuidanceContext().mapPinPlaced,true);
assert.match($('notice').textContent,/D placed where you clicked/,'the user receives a placement confirmation');
assert.equal(created.find(node=>node.id==='guided-inline-help')?.hidden,true,'inline help stays out of the map area while placement is held');

// Repeated guidance updates change explanatory text and DOM while retaining the map screen position.
const heldTop=mapTop;
for(const phrase of ['The map stays at the same zoom and position.','The next decision can wait.','Your destination pin is placed.']){
  $('next-action-text').textContent=phrase;
  mapTop=heldTop+24; // Simulate the map moving when surrounding guidance text changes layout.
  guidance.update();
  assert.equal(mapTop,heldTop,'the guidance update corrects layout drift back to the held map position');
}
assert.equal(mapTop,heldTop,'repeated guidance changes preserve the map screen Y');
assert.ok(scrollByCalls>=3,'each simulated layout shift is corrected with a scroll adjustment');
assert.equal(JSON.stringify({view:map.view,bounds:map.bounds,pan:map.pan}),initialView);

// Explain this choice is the actual See my choices control in the dock.
assert.equal(typeof $('guided-dock-explain').listeners.click,'function','the real See my choices handler is bound');
$('guided-dock-explain').listeners.click();
assert.equal(app.getGuidanceContext().mapPlacementHeld,false,'See my choices releases the map hold');
assert.equal($('guided-decisions').scrollIntoViewCalls,1,'See my choices scrolls to the decisions panel');
assert.equal($('guided-decision-title').focused,true,'See my choices focuses the decisions heading');

// Show me this control is a separate guide action and also releases the hold.
assert.equal(app.armMapPick('destination'),true);
assert.equal(typeof $('guided-show-next').listeners.click,'function','the real Show me control handler is bound');
$('guided-show-next').listeners.click();
assert.equal(app.getGuidanceContext().mapPlacementHeld,false,'Show me the control releases the map hold');

// Escape and Cancel both clear the saved map anchor; future guidance cannot restore it.
assert.equal(app.armMapPick('destination'),true);
let prevented=false;
const escapeHandler=events['document:keydown'].find(fn=>String(fn).includes("event.key==='Escape'&&mapPick"));
assert.equal(typeof escapeHandler,'function','the real Escape handler is bound');
assert.equal(vm.runInContext('mapPick',env),'destination','the Escape handler sees the active destination pick');
escapeHandler({key:'Escape',preventDefault(){prevented=true;}});
assert.equal(prevented,true,'Escape is consumed while map placement is active');
assert.equal(app.getGuidanceContext().mapPlacementHeld,false,'Escape cancels placement and releases the map hold');
let afterEscape=mapTop;mapTop=afterEscape+30;guidance.update();
assert.equal(mapTop,afterEscape+30,'guidance updates do not restore the pre-Escape map position');
assert.equal(app.armMapPick('destination'),true);
assert.equal(typeof $('cancel-map-pick').listeners.click,'function','the real Cancel map pick handler is bound');
$('cancel-map-pick').listeners.click();
assert.equal(app.getGuidanceContext().mapPlacementHeld,false,'Cancel map pick releases the map hold');
const afterCancel=mapTop;mapTop=afterCancel+30;guidance.update();
assert.equal(mapTop,afterCancel+30,'guidance updates do not restore the pre-Cancel map position');

// Re-enter placement, then emulate deliberate manual scrolling. Guidance updates must respect it.
assert.equal(app.armMapPick('destination'),true);
const wheel=events.wheel;assert.equal(typeof wheel,'function','the actual guided-focus listener is registered');
wheel({});
assert.equal(app.getGuidanceContext().mapPlacementHeld,false,'manual scroll releases the placement hold');
const userChosenTop=mapTop-240;mapTop=userChosenTop;
guidance.update();guidance.update();
assert.equal(mapTop,userChosenTop,'later guidance updates respect the user scroll position');
assert.equal(JSON.stringify({view:map.view,bounds:map.bounds,pan:map.pan}),initialView);
assert.equal(networkCalls,0);
assert.equal(state.providerCalls.HERE,0);assert.equal(state.providerCalls.RentCast,0);assert.equal(state.providerCalls.Valhalla,0);
console.log('Guided map stability: destination click coordinates and pin, unchanged map view, placement confirmation, repeated guidance screen-Y preservation, See my choices and Show me release, Escape and Cancel release, and manual-scroll respect passed. Network/provider calls: 0.');
