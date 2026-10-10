import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8'),html=readFileSync('dist/index.html','utf8');
assert.match(html,/id="red-cutoff" type="range" min="1" max="1000"/,'lower bound tops at $1,000 PPSQFT');
assert.match(html,/id="color-upper" type="range" min="0" max="1000"/,'upper bound uses a normalized slider');
assert.match(source,/upper>20000/,'upper bound validation tops at $20,000 PPSQFT');
assert.match(html,/id="confirm-red-cutoff"[^>]*>Apply \$200 PPSQFT to ranking/,'the lower-bound Apply action remains explicit');
assert.doesNotMatch(html,/id="apply-color-upper"/,'the upper slider no longer requires a separate apply click');
assert.match(source,/\$\('red-cutoff'\)\.addEventListener\('change',\(\)=>applyOrangeThresholdFromSlider\(\)\)/,'the lower slider previews colors and applies the ranking on release/change');
assert.match(source,/\$\('color-upper'\)\.addEventListener\('change',\(\)=>confirmColorUpper\(\)\)/,'the upper slider previews colors on release/change');
assert.match(source,/\$\('confirm-red-cutoff'\)\.addEventListener\('click',\(\)=>confirmRedThreshold\(\)\)/,'the Apply button can also commit the lower threshold for ranking');
const preview=source.match(/function previewColorScale\([\s\S]*?\nfunction applyOrangeThresholdFromSlider/)[0];
assert.doesNotMatch(preview,/refreshThresholdResults|renderCandidates|rankPoolResults|confirmRedThreshold|schedulePoolReviewPreparation/,'map-color preview has no route-ranking or planning calls');
assert.match(preview,/drawMap\(\);if\(state\.routes\.length\)renderCells\(\)/,'every released PPSQFT preview redraws the map (and therefore recomputes draft zones), even before routes exist');
const zones=source.match(/function drawRedExclusionZoneLayer\(\)[\s\S]*?\nfunction scheduleMapLayoutRefresh/)[0];
assert.match(zones,/cutoff=exclusionZoneThreshold\(\)/,'draft exclusion zones use the independent Exclusion Zone cutoff');
assert.match(source,/drawKnownAvmLayer\(route\);if\(redrawZones\)drawRedExclusionZoneLayer\(\)/,'map redraws recolor known cells and can independently recompute the draft exclusion zones');

const elements=new Map();
function element(value=''){return{value,textContent:'',disabled:false,style:{},classList:{toggle(){}},setAttribute(){},addEventListener(){}};}
for(const [id,value] of [['red-cutoff','200'],['red-cutoff-value','$200 PPSQFT'],['confirm-red-cutoff',''],['red-cutoff-status',''],['color-upper','500'],['color-upper-value','$500 PPSQFT'],['color-upper-status','']])elements.set(id,element(value));
const ui={document:{activeElement:null,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll:()=>[]},fetch(){throw Error('PPSQFT color slider test must stay offline');}};ui.window=ui;
vm.createContext(ui);vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),ui);
const app=ui.SurviveDrive,state=app.getState(),priorResults=[{rank:1,route_id:'kept'}];
state.redThresholdPpsqft=200;state.mapColorLowerPpsqft=200;state.colorUpperPpsqft=500;state.colorUpperCustomized=false;state.redThresholdConfirmed=true;state.poolScreening.results=priorResults;
const before=app.color(250);
assert.equal(app.previewColorScale(300,500),true);
assert.equal(state.mapColorLowerPpsqft,300,'the released lower slider changes the map preview');
assert.equal(state.redThresholdPpsqft,200,'the preview does not commit the route-ranking threshold');
assert.equal(state.poolScreening.results,priorResults,'the preview leaves existing ranking results untouched');
assert.notEqual(app.color(250),before,'cell coloration immediately reflects the preview lower bound');
assert.match(elements.get('red-cutoff-status').textContent,/ranking remains at \$200/,'the UI distinguishes preview from applied ranking');
assert.equal(app.confirmColorUpper(700),true);
assert.equal(state.colorUpperPpsqft,700,'released upper slider updates the map scale');
assert.equal(state.redThresholdPpsqft,200,'upper-bound changes never rerank');
assert.equal(state.poolScreening.results,priorResults,'upper-bound changes leave ranking results untouched');
console.log('Passed lower/upper PPSQFT slider markup and release handling, immediate map-color preview, independent applied cutoff, and release-to-rerank wiring and optional Apply. No provider calls.');
