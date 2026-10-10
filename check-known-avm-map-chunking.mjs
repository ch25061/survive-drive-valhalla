import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('dist/app.js','utf8');
const start=app.indexOf('function drawKnownAvmLayer(');
assert.notEqual(start,-1,'known-cell map renderer exists');
const end=app.indexOf('\nfunction ',start+10);
const extract=name=>{const begin=app.indexOf('function '+name+'('),finish=app.indexOf('\nfunction ',begin+10);assert.notEqual(begin,-1);return app.slice(begin,finish<0?undefined:finish);};
const source=['avmDisplayCell','avmCellLayer'].map(extract).join('\n')+'\n'+app.slice(start,end<0?undefined:end);
const frames=[],rendered=[],events=[];
const cells=Array.from({length:130},(_,index)=>({cell_id:'cell-'+index,estimate_ppsqft:200+index,polygon:[[41,-88],[41.001,-88],[41,-87.999]]}));
const overlay={layers:[],addTo(){return this;}};
const control={checked:true};
const context={
  state:{map_cell_evidence:[]},map:{getPane:()=>({style:{}}),createPane(){}},mapPick:null,
  knownAvmLayer:null,knownAvmRenderer:null,knownAvmDrawEpoch:0,
  window:{L:null},requestAnimationFrame:callback=>frames.push(callback),
  $:id=>id==='show-all-known-avm-cells'?control:{},current:()=>null,
  validMapEstimate:value=>Number.isFinite(value)&&value>0,mapEvidenceKey:cell=>cell.cell_id,
  allKnownAvmCells:()=>cells,color:()=>'#35a86b',money:value=>'$'+value,
  shouldDrawAvmCell:()=>true,cellFillOpacity:()=>.7,bindAvmCellTooltip:(layer,cell,label,options)=>layer.bindTooltip(label,options),
  handleMapClick(){events.push('click');},
  L:{layerGroup:()=>overlay,canvas:()=>({}),polygon(points,options){const layer={points,options,addTo(parent){parent.layers.push(this);rendered.push(this);return this;},bindTooltip(value){this.tooltip=value;return this;},on(name,handler){this[name]=handler;return this;}};return layer;},DomEvent:{stopPropagation(){}}}
};
vm.createContext(context);
context.window.L=context.L;
vm.runInContext(source,context);
vm.runInContext('drawKnownAvmLayer()',context);
assert.equal(rendered.length,64,'the first map task stays bounded to one small chunk');
assert.equal(frames.length,1,'remaining known cells are scheduled for later frames');
while(frames.length)frames.shift()();
assert.equal(rendered.length,130,'every known cell is eventually drawn');
assert.ok(rendered.every(layer=>layer.tooltip.endsWith('PPSQFT')),'hover PPSQFT tooltips are preserved');
assert.equal(typeof rendered[0].click,'function','known cells remain clickable');

console.log('Passed responsive 64-cell rendering chunks, complete all-known coverage, and preserved hover/click behavior. Provider calls: 0.');
