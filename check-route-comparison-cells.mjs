import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const nodes=new Map();let requests=0;
const element=()=>({children:[],style:{},attributes:{},checked:true,listeners:{},classList:{toggle(){}},replaceChildren(...items){this.children=items;},append(...items){this.children.push(...items);},setAttribute(key,value){this.attributes[key]=String(value);},addEventListener(key,fn){this.listeners[key]=fn;}});
const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
const panes=new Map(),map={removeLayer(item){item.removed=true;},getPane:name=>panes.get(name),createPane(name){const pane={style:{}};panes.set(name,pane);return pane;}};
function layer(points,options={}){return{points,options,layers:[],handlers:{},addTo(parent){parent.layers?.push(this);return this;},on(name,fn){this.handlers[name]=fn;return this;},bindTooltip(text){this.tooltip=text;return this;},eachLayer(fn){this.layers.forEach(fn);},setStyle(style){Object.assign(this.options,style);}};}
const ui={L:{layerGroup:()=>layer(null),polygon:layer,canvas:()=>({}),DomEvent:{stopPropagation(){}}},mockMap:map,document:{getElementById:get,createElement:element,createElementNS:element},fetch(){requests++;throw Error('Cell comparison must remain offline');}};ui.window=ui;
vm.createContext(ui);vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),ui);
const state=ui.SurviveDrive.getState(),cell=(id,x,value=null)=>({cell_id:id,latitude:0,longitude:x,polygon:[[x-.001,-.001],[x+.001,-.001],[x+.001,.001],[x-.001,.001]],estimate_ppsqft:value,outside_here_distance_m:100});
const shared=cell('shared',.01),unknownA=cell('unknown-a',0),unknownB=cell('unknown-b',.02),knownB=cell('known-b',.03,300),neighbor=cell('surrounding',.04),unrelated=cell('unrelated',.05);
const a={id:'a',geometry:[[0,0],[.01,0]],cells:[unknownA,shared]},b={id:'b',geometry:[[.01,0],[.03,0]],cells:[{...shared},unknownB,knownB]},c={id:'c',geometry:[[.05,0],[.06,0]],cells:[unrelated]};
state.routes=[a,b,c];state.active=2;state.map_cell_evidence=[{...shared,estimate_ppsqft:150},cell('off-route-known',.06,400)];
ui.testA=a;ui.testB=b;ui.testGrid=[shared,neighbor];
vm.runInContext('map=mockMap;routeComparison={routes:[testA,testB],overlap:exactRouteOverlap(testA,testB)};honeycombGeometry.set(testA,{identity:coverageIdentity(testA),cells:testGrid});honeycombGeometry.set(testB,{identity:coverageIdentity(testB),cells:testGrid});',ui);
const unchanged=JSON.stringify(state);
ui.drawDisplayedRouteCellLayers();
const displayed=()=>vm.runInContext('routeAvmLayer.layers',ui),evidence=()=>vm.runInContext('mapEvidenceLayer.layers',ui);
assert.equal(displayed().length,4,'both compared routes are filled; shared cells are drawn once');
for(const id of ['unknown-a','unknown-b']){const item=displayed().find(item=>item.avmCellId===id);assert.equal(item.options.fillColor,'#8a96a6');assert.equal(item.options.fillOpacity,.70);assert.match(item.tooltip,/Unknown/);assert.equal(typeof item.handlers.click,'function');}
assert.ok(!displayed().some(item=>item.avmCellId==='unrelated'),'active route outside the pair does not add cells');
assert.equal(displayed().find(item=>item.avmCellId==='shared').options.fillColor,ui.color(150),'saved known evidence overrides a displayed unknown without altering the route');
assert.equal(displayed().find(item=>item.avmCellId==='known-b').options.fillColor,ui.color(300));
assert.equal(evidence().length,1,'shared inspected evidence is not filled twice');
assert.equal(evidence()[0].avmCellId,'off-route-known');
assert.ok(vm.runInContext('knownAvmLayer.layers',ui).every(item=>!['shared','known-b'].includes(item.avmCellId)),'background known cells do not duplicate comparison cells');
assert.equal(vm.runInContext('honeycombLayer.layers.length',ui),2,'shared surrounding grid is deduplicated');
assert.ok(vm.runInContext('honeycombLayer.layers',ui).every(item=>item.options.fill===false),'surrounding grid stays transparent');
assert.equal(panes.get('route-avm-cells').style.zIndex,420);
ui.SurviveDrive.setCellColorOpacity(.85);assert.ok(displayed().every(item=>item.options.fillOpacity===.85),'both routes obey the opacity slider');
let inspected=null;ui.handleMapClick=(point,cell)=>{inspected=cell.cell_id;};displayed().find(item=>item.avmCellId==='unknown-b').handlers.click({latlng:{lat:0,lng:.02}});assert.equal(inspected,'unknown-b','nonactive route cells can be inspected');
ui.authorityRanges=()=>[];ui.drawFallback();const svg=get('fallback-svg'),fills=svg.children.filter(item=>item.attributes.class==='avm-cell-colorable');assert.equal(fills.filter(item=>item.attributes['data-cell-id']==='shared').length,1);
for(const id of ['unknown-a','unknown-b'])assert.equal(fills.find(item=>item.attributes['data-cell-id']===id).attributes.fill,'#8a96a6');
assert.ok(svg.children.filter(item=>item.attributes['aria-label']==='Surrounding honeycomb grid').every(item=>item.attributes.fill==='none'));
fills.find(item=>item.attributes['data-cell-id']==='unknown-b').listeners.click();assert.equal(inspected,'unknown-b');
vm.runInContext('routeComparison=null;',ui);ui.drawDisplayedRouteCellLayers();assert.deepEqual(Array.from(displayed(),item=>item.avmCellId),['unrelated'],'ending comparison restores active-route cells');
assert.equal(JSON.stringify(state),unchanged,'display never changes route evidence, selection, ranking, or authorization');assert.equal(requests,0);
console.log('Comparison cells passed: both unknown routes grey, exact saved known values, shared-cell deduplication across layers, transparent surrounding grid, inspection on either route, opacity updates, fallback parity, active-route restoration, unchanged evidence, and zero provider calls.');

