import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const listeners=new Map(),classes=new Set(),elements=new Map();let fetchCalls=0,selected=0,captured=null;
const strip={scrollLeft:120,candidateDragBound:false,classList:{add(...names){for(const name of names)classes.add(name);},remove(...names){for(const name of names)classes.delete(name);}},addEventListener(type,handler,options){listeners.set(type,{handler,options});},setPointerCapture(id){captured=id;},hasPointerCapture(id){return captured===id;},releasePointerCapture(id){if(captured===id)captured=null;}};
const element={addEventListener(){},classList:{add(){},remove(){},toggle(){}}};
const ui={document:{getElementById(id){if(id==='candidate-list')return strip;if(!elements.has(id))elements.set(id,{...element});return elements.get(id);}},fetch(){fetchCalls++;throw Error('dragging must not make requests');}};ui.window=ui;
vm.createContext(ui);vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),ui);
ui.SurviveDrive.bindCandidateStripDrag();ui.SurviveDrive.bindCandidateStripDrag();
assert.equal(listeners.size,5,'binding is idempotent');
const css=readFileSync('dist/style.css','utf8');
assert.match(css,/\.candidate-list\{[^}]*cursor:grab[^}]*touch-action:pan-x pan-y/);
assert.match(css,/\.candidate-list\.is-grabbed,\.candidate-list\.is-dragging[^}]*\{cursor:grabbing!important/);

function fire(type,properties={}){let prevented=false,stopped=false,immediate=false;const event={pointerId:1,pointerType:'mouse',button:0,isPrimary:true,clientX:100,clientY:12,detail:1,preventDefault(){prevented=true;},stopPropagation(){stopped=true;},stopImmediatePropagation(){immediate=true;},...properties};listeners.get(type).handler(event);return{event,prevented,stopped,immediate};}
fire('pointerdown');assert.ok(classes.has('is-grabbed'));
fire('pointermove',{clientX:65});assert.equal(strip.scrollLeft,155);assert.equal(captured,1);assert.ok(classes.has('is-dragging'));
fire('pointerup',{clientX:65});assert.equal(captured,null);assert.equal(classes.has('is-grabbed'),false);assert.equal(classes.has('is-dragging'),false);
let click=fire('click',{clientX:65});if(!click.immediate)selected++;assert.equal(selected,0,'the click produced by a drag must not select a card');assert.equal(click.prevented,true);assert.equal(click.stopped,true);
click=fire('click',{clientX:90});if(!click.immediate)selected++;assert.equal(selected,1,'a separate ordinary card click remains available');

fire('pointerdown',{pointerType:'touch',clientX:50,clientY:30});fire('pointermove',{pointerType:'touch',clientX:27,clientY:31});assert.ok(classes.has('is-dragging'),'touch pointer movement can scroll horizontally');fire('pointerup',{pointerType:'touch',clientX:27,clientY:31});
click=fire('click',{pointerType:'touch',clientX:27,clientY:31});if(!click.immediate)selected++;assert.equal(selected,1,'touch drag must not select a route');assert.equal(fetchCalls,0,'pointer dragging must never request provider data');
console.log('Passed offline candidate-strip drag checks: grab feedback, mouse/touch horizontal scroll, click suppression after dragging, ordinary click preservation, and zero fetches.');
