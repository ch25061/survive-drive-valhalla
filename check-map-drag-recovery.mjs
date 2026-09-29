import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
assert.match(source,/function drawMap\([^\n]*bindLeafletDragRecovery\(\)/,'map creation must install the recovery listeners');
const documentHandlers=new Map(),windowHandlers=new Map(),registrations=[];
const L={Draggable:{_dragging:false}};
const document={hidden:false,getElementById(){return{addEventListener(){}};},querySelectorAll(){return[];},addEventListener(name,handler,capture){registrations.push(name);documentHandlers.set(name,{handler,capture});}};
const ui={L,document,addEventListener(name,handler){windowHandlers.set(name,handler);},fetch(){throw Error('Drag recovery must not request a provider.');}};
ui.window=ui;
vm.createContext(ui);
vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),ui);
vm.runInContext('bindLeafletDragRecovery();bindLeafletDragRecovery();',ui);
assert.equal(registrations.filter(name=>name==='mousemove').length,1);
assert.equal(documentHandlers.get('mousemove').capture,true,'recovery runs before Leaflet document drag movement');

let recovered=0;
const staleDrag=()=>({finishDrag(noInertia){assert.equal(noInertia,true);recovered++;L.Draggable._dragging=false;}});
L.Draggable._dragging=staleDrag();documentHandlers.get('mousemove').handler({buttons:1});assert.equal(recovered,0,'ordinary held-button dragging continues');
documentHandlers.get('mousemove').handler({buttons:0});assert.equal(recovered,1,'a missed mouse-up is recovered while hovering');
documentHandlers.get('mousemove').handler({buttons:0});assert.equal(recovered,1,'an idle mouse move does nothing');
L.Draggable._dragging=staleDrag();documentHandlers.get('mousemove').handler({});assert.equal(recovered,1,'an unknown button state does not cancel a drag');
windowHandlers.get('blur')();assert.equal(recovered,2,'leaving the window releases a drag');
L.Draggable._dragging=staleDrag();document.hidden=true;documentHandlers.get('visibilitychange').handler();assert.equal(recovered,3,'hiding the page releases a drag');
document.hidden=false;L.Draggable._dragging=staleDrag();documentHandlers.get('visibilitychange').handler();assert.equal(recovered,3,'showing the page does not cancel a new drag');
documentHandlers.get('keydown').handler({key:'Escape'});assert.equal(recovered,4,'Escape releases a drag even if the browser still reports a held button');
console.log('Passed missed mouse-up, window-blur, and hidden-page drag recovery checks. Provider calls: 0.');
