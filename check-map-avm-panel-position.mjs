import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const helpers=source.slice(source.indexOf('function positionMapAvmPanel(){'),source.indexOf('\nfunction dismissMapAvm(){'));
assert.ok(helpers.startsWith('function positionMapAvmPanel(){'));
assert.match(source,/function drawMapInquiry\(\).*bindMapAvmPanelPosition\(\);positionMapAvmPanel\(\)/);
assert.match(source,/finally\{endWorking\(\);positionMapAvmPanel\(\);\}/,'the completed free check repositions a larger approval prompt');
assert.match(source,/updateNearbyStreetView\(\);scheduleMapAvmPanelPosition\(\);/,'moving the yellow bubble also moves the approval panel');
const css=readFileSync('dist/style.css','utf8');
assert.match(css,/#map-avm-panel\{[^}]*right:auto/);
assert.match(css,/#map-avm-panel\{[^}]*overflow:auto/);

function harness(){
  const frames=[],events={},mapEvents={},viewEvents={},observers=[];
  const rect={left:300,top:200,right:1200,bottom:1100,width:900,height:900};
  let contentHeight=260;
  const panel={hidden:false,style:{},getBoundingClientRect(){return{width:parseFloat(this.style.width)||360,height:Math.min(contentHeight,parseFloat(this.style.maxHeight)||contentHeight)};}};
  const element={getBoundingClientRect:()=>({...rect})},banner={hidden:true};
  const state={inspection:[250,200]},inquiry={point:[250,200]};
  const window={innerWidth:1800,innerHeight:1000,addEventListener(type,fn){events[type]=fn;},ResizeObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(element){(this.elements??=[]).push(element);}}};
  const map={latLngToContainerPoint:([lat,lng])=>({x:lng,y:lat}),on(type,fn){mapEvents[type]=fn;}};
  const ui={window,map,state,mapInquiry:inquiry,mapAvmPositionBound:false,mapAvmPositionQueued:false,mapAvmPositionObserver:null,
    $:id=>id==='map-avm-panel'?panel:id==='map'||id==='map-work-area'?element:banner,
    requestAnimationFrame:fn=>frames.push(fn)};
  vm.createContext(ui);vm.runInContext(helpers,ui);
  const position=()=>ui.positionMapAvmPanel(),flush=()=>{while(frames.length)frames.shift()();};
  const box=()=>({left:rect.left+parseFloat(panel.style.left),top:rect.top+parseFloat(panel.style.top),width:parseFloat(panel.style.width),height:panel.getBoundingClientRect().height});
  return{ui,panel,state,rect,banner,window,mapEvents,events,viewEvents,observers,frames,position,flush,box,set contentHeight(value){contentHeight=value;}};
}
const h=harness();h.position();
assert.deepEqual(h.box(),{left:518,top:426,width:360,height:260},'the prompt appears 18 pixels beside the clicked point');
h.state.inspection=[250,850];h.position();assert.equal(h.box().left,772,'a click near the right edge puts the prompt on its left');
h.state.inspection=[720,200];h.position();assert.equal(h.box().top,642,'a click near the screen bottom puts the full prompt above it');
// The map is a tall square and only its middle is visible after page scrolling.
h.rect.top=-600;h.rect.bottom=300;h.state.inspection=[700,200];h.position();
assert.ok(h.box().top>=8&&h.box().top+h.box().height<=292,'scrolling the map cannot strand the panel above or below the screen');
h.rect.top=200;h.rect.bottom=1100;h.window.innerWidth=700;h.state.inspection=[100,380];h.position();
assert.equal(h.box().left,308);assert.ok(h.box().left+h.box().width<=692,'horizontal clipping keeps the panel within the visible portion of the map');
h.window.visualViewport={offsetLeft:20,offsetTop:100,width:600,height:400,addEventListener(type,fn){h.viewEvents[type]=fn;}};
h.contentHeight=700;h.position();assert.ok(h.box().top>=208&&h.box().top+h.box().height<=492);
assert.equal(h.panel.style.maxHeight,'284px','a short visual viewport caps the panel and scrolls its contents');
delete h.window.visualViewport;h.window.innerWidth=1800;h.rect.top=-50;h.rect.bottom=850;
h.banner.hidden=false;h.banner.getBoundingClientRect=()=>({top:0,bottom:90});h.state.inspection=[60,200];h.contentHeight=260;h.position();
assert.equal(h.box().top,98,'the prompt stays below the sticky workflow banner');
h.banner.hidden=true;h.rect.top=200;h.rect.bottom=1100;h.state.inspection=[720,200];h.position();const smallTop=h.box().top;
h.contentHeight=500;h.position();assert.ok(h.box().top<smallTop&&h.box().top+h.box().height<=992,'the expanded approval text remains fully on screen');

h.ui.bindMapAvmPanelPosition();h.ui.bindMapAvmPanelPosition();
assert.deepEqual(Object.keys(h.mapEvents).sort(),['move','resize','zoom']);
assert.deepEqual(Object.keys(h.events).sort(),['resize','scroll']);assert.equal(h.observers.length,1);assert.equal(h.observers[0].elements.length,2);
h.state.inspection=[250,200];h.mapEvents.move();h.events.scroll();h.events.resize();h.observers[0].fn();
assert.equal(h.frames.length,1,'pan, scroll, size, and content changes share one layout update per frame');h.flush();
assert.equal(h.box().left,518,'the panel follows the current yellow bubble rather than a fixed map corner');
h.panel.hidden=true;const oldStyle={...h.panel.style};h.ui.scheduleMapAvmPanelPosition();h.position();assert.deepEqual(h.panel.style,oldStyle);assert.equal(h.frames.length,0,'dismissed prompts stay dismissed');
h.panel.hidden=false;h.rect.top=1200;h.rect.bottom=2100;h.position();assert.equal(h.panel.style.visibility,'hidden');
h.rect.top=200;h.rect.bottom=1100;h.position();assert.equal(h.panel.style.visibility,'','scrolling back into the map restores the nearby panel');
const mobile=harness();mobile.window.visualViewport={offsetLeft:10,offsetTop:50,width:380,height:450,addEventListener(type,fn){mobile.viewEvents[type]=fn;}};
mobile.ui.bindMapAvmPanelPosition();assert.deepEqual(Object.keys(mobile.viewEvents).sort(),['resize','scroll']);
console.log('AVM panel placement passed: beside clicked cell, left/above edge flipping, partially visible square maps, horizontal clipping, sticky banner, short visual viewport, expanded content, pan/zoom/scroll/resize tracking, dismissal, and zero network/provider requests.');
