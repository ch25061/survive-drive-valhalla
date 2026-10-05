import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8'),html=readFileSync('dist/index.html','utf8'),css=readFileSync('dist/style.css','utf8');
assert.match(html,/id="route-line-color-wheel"[^>]*role="group"[^>]*tabindex="0"[^>]*aria-label="Route color picker"/, 'the color wheel is focusable and named');
for(const [color,name] of [['#0072B2','Blue'],['#D55E00','Vermilion'],['#009E73','Bluish green'],['#6A3D9A','Purple'],['#333333','Charcoal']]) assert.match(html,new RegExp(`data-route-color="${color}"[^>]*>[\\s\\S]*?${name}`),`${name} is an optional named color-blind-friendly shortcut`);
assert.match(source,/const chooseAt=event=>\{const rect=wheel\.getBoundingClientRect\(\),dx=.*?saturation=Math\.max\(0,Math\.min\(1,Math\.hypot\(dx,dy\)\/radius\)\)/,'every wheel location maps to hue and radial saturation without an excluded center');
assert.match(source,/ArrowRight[\s\S]*?ArrowLeft[\s\S]*?ArrowUp[\s\S]*?ArrowDown[\s\S]*?Home[\s\S]*?End/,'the two-dimensional picker is keyboard operable');
assert.match(source,/route-line-opacity[\s\S]*?setRouteLineOpacity/,'opacity control updates the route line');
assert.match(source,/route-line-thickness[\s\S]*?setRouteLineThickness/,'thickness control updates the route line');
assert.match(source,/line\.setAttribute\('stroke-width',String\(routeLineThickness\)\)/,'SVG redraws use selected thickness');
assert.match(source,/\{color:routeLineColor,weight:routeLineThickness,opacity:routeLineOpacity\}/,'Leaflet redraws use selected color, thickness, and opacity');
assert.match(css,/radial-gradient\(circle,white 0%,transparent 82%\),conic-gradient/,'the wheel visualizes saturation from its center to edge');

const elements=new Map(),stored=new Map(),presetButtons=['#0072B2','#D55E00','#009E73','#6A3D9A','#333333'].map(routeColor=>({dataset:{routeColor},attributes:{},setAttribute(key,value){this.attributes[key]=value;}}));
function element(){return{value:'',hidden:false,disabled:false,textContent:'',style:{},attributes:{},dataset:{},setAttribute(key,value){this.attributes[key]=value;},addEventListener(){},querySelector(){return null;}};}
const svg=element(),routeSvgLine=element();svg.querySelector=()=>routeSvgLine;
const ui={document:{getElementById(id){if(id==='fallback-svg')return svg;if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll:()=>presetButtons},localStorage:{setItem(k,v){stored.set(k,v);},getItem(k){return stored.get(k)??null;}},fetch(){throw Error('route-color test must stay offline');}};ui.window=ui;
vm.createContext(ui);vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),ui);
const app=ui.SurviveDrive;
assert.equal(app.getRouteLineColor(),'#00aaff');
assert.equal(app.setRouteLineColor('#D55E00'),true);assert.equal(app.getRouteLineColor(),'#d55e00');
assert.equal(stored.get('survive-drive-route-line-color'),'#d55e00','color persists locally');
assert.equal(routeSvgLine.attributes.stroke,'#d55e00','SVG route updates immediately');
assert.equal(elements.get('route-line-color-value').textContent,'#D55E00','the selected hex value is announced');
assert.equal(presetButtons[1].attributes['aria-pressed'],'true','the selected optional preset is exposed accessibly');
assert.equal(presetButtons[0].attributes['aria-pressed'],'false');
assert.equal(app.setRouteLineColor('bad'),false,'invalid colors are rejected');
assert.equal(app.setRouteLineHueSaturation(120,.5),true,'continuous hue and saturation selection works');
assert.match(app.getRouteLineColor(),/^#[0-9a-f]{6}$/,'arbitrary wheel positions resolve to a usable color');
app.setRouteLineHueSaturation(220,0);assert.equal(app.getRouteLineColor(),'#ffffff','the wheel center selects an unsaturated color');
app.setRouteLineOpacity(.72);assert.equal(app.getRouteLineOpacity(),.72);assert.equal(stored.get('survive-drive-route-line-opacity'),'0.72');assert.equal(routeSvgLine.attributes['stroke-opacity'],'0.72','SVG opacity updates immediately');
app.setRouteLineThickness(8.5);assert.equal(app.getRouteLineThickness(),8.5);assert.equal(stored.get('survive-drive-route-line-thickness'),'8.5');assert.equal(routeSvgLine.attributes['stroke-width'],'8.5','SVG thickness updates immediately');
console.log('Passed continuous route-color wheel, center-to-edge saturation, keyboard controls, optional accessible presets, persistent opacity and thickness controls, immediate SVG updates, and Leaflet redraw wiring. No provider calls.');


