import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('dist/index.html','utf8'),source=readFileSync('dist/app.js','utf8');
const stages=['prepare','search','inspect','choose'];
for(const stage of stages)assert.match(html,new RegExp('data-panel="'+stage+'"[^>]*>\\s*<div data-pps-bound-controls="'+stage+'"'));
const elements=new Map();
const element=(value='')=>({value,textContent:'',disabled:false,attributes:new Map(),setAttribute(name,value){this.attributes.set(name,value);},getAttribute(name){return this.attributes.get(name)??null;},addEventListener(){}});
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
get('red-cutoff').value='200';get('color-upper').value='599';
const ui={document:{activeElement:null,getElementById:get,querySelectorAll(){return[];}},fetch(){throw Error('This check must stay offline');}};ui.window=ui;
vm.createContext(ui);vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),ui);
const app=ui.SurviveDrive,state=app.getState();
const copies=stages.map(()=>({nodes:new Map(['red-cutoff','color-upper','red-cutoff-value','color-upper-value','red-cutoff-status','color-upper-status','confirm-red-cutoff'].map(id=>[id,element()]))}));
ui.copies=copies;vm.runInContext('ppsBoundControlCopies.push(...copies);drawMap=()=>{};renderExclusionZoneLevel=()=>{};notice=()=>{};',ui);
app.renderRedThreshold();
for(const copy of copies){assert.equal(copy.nodes.get('red-cutoff').value,'200');assert.equal(copy.nodes.get('color-upper-value').textContent,'$500 PPSQFT');}
app.previewColorScale(250,700);
for(const copy of copies){assert.equal(copy.nodes.get('red-cutoff').value,'250');assert.equal(copy.nodes.get('color-upper-value').textContent,'$700 PPSQFT');}
assert.equal(state.redThresholdPpsqft,200,'preview still leaves applied ranking unchanged');
ui.document.activeElement=copies[0].nodes.get('red-cutoff');get('red-cutoff').value='275';
app.renderRedThreshold();
assert.equal(get('red-cutoff').value,'275','a rerender preserves the in-progress slider value when a copy has focus');
for(const copy of copies)assert.equal(copy.nodes.get('red-cutoff').value,'275');
get('red-cutoff').disabled=true;get('confirm-red-cutoff').disabled=true;
app.syncPpsBoundControls();
for(const copy of copies){assert.equal(copy.nodes.get('red-cutoff').disabled,true);assert.equal(copy.nodes.get('confirm-red-cutoff').disabled,true);}
get('red-cutoff').disabled=false;get('confirm-red-cutoff').disabled=false;
app.syncPpsBoundControls();
for(const copy of copies)assert.equal(copy.nodes.get('red-cutoff').disabled,false);
assert.equal(app.buildSessionExport().settings.color_upper_ppsqft,700,'copies use the same exported settings');
assert.equal(state.exclusionZoneThresholdPpsqft,200,'the separate exclusion threshold is untouched');
console.log('Passed four PPSQFT control copies, shared values, preview/ranking separation, focus preservation, locks, and exported settings. Provider calls: 0.');
