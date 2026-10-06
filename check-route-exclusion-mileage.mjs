import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8'),html=readFileSync('dist/index.html','utf8');
const gateSelect=html.match(/<select id="shotgun-count">([^<]*(?:<option[^>]*>[^<]*<\/option>)*)<\/select>/)?.[1];
assert.ok(gateSelect);assert.match(gateSelect,/<option selected>6<\/option>/);
assert.equal((gateSelect.match(/selected/g)??[]).length,1);
assert.match(source,/const DEFAULT_ESCAPE_GATE_COUNT=6;/);
assert.match(source,/async function init\(\)\{[^\n]*\$\('shotgun-count'\)\.value=String\(DEFAULT_ESCAPE_GATE_COUNT\)/,'cached preview HTML also starts new trips with six gates');
assert.match(source,/maximum:Number\(\$\('shotgun-count'\)\.value\),sectors:Number\(\$\('shotgun-count'\)\.value\)/,'the shared control feeds both gate searches');

const elements=new Map();
const node=()=>({children:[],value:'',checked:false,hidden:false,disabled:false,textContent:'',
  classList:{add(){},remove(){},toggle(){}},append(...children){this.children.push(...children);},
  replaceChildren(...children){this.children=[...children];},setAttribute(){},removeAttribute(){},addEventListener(){}});
const ui={document:{getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);},createElement:node},
  fetch(){throw Error('Mileage checks must not make provider calls');}};ui.window=ui;
vm.createContext(ui);vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),ui);
const state=ui.SurviveDrive.getState(),mile=1609.344;
state.redThresholdPpsqft=200;state.exclusionZoneThresholdPpsqft=100;
const cell=(id,meters,value)=>({cell_id:id,outside_here_distance_m:meters,estimate_ppsqft:value});
const route={id:'mixed',name:'Mixed',cells:[cell('red-only',mile,120),cell('exclusion',mile/2,80),cell('equal',mile/4,100),cell('above-red',mile,220),cell('unknown',mile*3,null),cell('highway',0,5),cell('too-small',.5,10)]};
const unknown={id:'unknown',name:'Unknown',cells:[cell('missing',mile,null)]};
const zero={id:'zero',name:'Zero',cells:[cell('known-above',mile,250)]};
state.routes=[route,unknown,zero];state.poolScreening.enabled_route_ids=state.routes.map(r=>r.id);
state.poolScreening.results=ui.rankPoolResults(state.routes,null,[]);
const ranks=state.poolScreening.results.map(row=>[row.route_id,row.rank]);
assert.equal(ui.knownExclusionZoneDistance(route),mile/2,'only known eligible mileage strictly below the independent cutoff counts');
assert.equal(ui.knownExclusionZoneDistance(unknown),null,'unknown distance stays unknown');
assert.equal(ui.knownExclusionZoneDistance(zero),0,'known evidence with no below-cutoff mileage is zero');
ui.renderCandidates();
const badges=()=>elements.get('candidate-list').children.flatMap(wrapper=>wrapper.children[0].children.filter(child=>child.className==='pool-screening-candidate-status').map(child=>child.textContent));
assert.ok(badges().some(text=>text.includes('Known Orange Miles Under $200: 1.75 mi · Known Exclusion Zone Miles Under $100: 0.50 mi · Orange Percent')),'the rendered card puts the new stat directly after Known Orange Miles');
assert.ok(badges().some(text=>text.includes('Known Exclusion Zone Miles Under $100: Unknown')));
assert.ok(badges().some(text=>text.includes('Known Exclusion Zone Miles Under $100: 0.00 mi')));
state.exclusionZoneThresholdPpsqft=140;ui.renderCandidates();
assert.equal(ui.knownExclusionZoneDistance(route),mile*1.75);
assert.ok(badges().some(text=>text.includes('Known Exclusion Zone Miles Under $140: 1.75 mi')),'the card reads the current Exclusion cutoff');
assert.deepEqual(state.poolScreening.results.map(row=>[row.route_id,row.rank]),ranks,'the display statistic does not alter ranking');
route.cells[4].estimate_ppsqft=50;ui.renderCandidates();
assert.equal(ui.knownExclusionZoneDistance(route),mile*4.75,'new evidence enters the statistic on the next render');
assert.ok(badges().some(text=>text.includes('Known Exclusion Zone Miles Under $140: 4.75 mi')));

// The configured six-gate default retains the complete ordered cross product.
vm.runInContext(readFileSync('dist/shotgun-gates.js','utf8'),ui);
const gates=Array.from({length:6},(_,index)=>({id:'g'+index,gate_number:index+1,name:'Gate '+index,latitude:41+index/100,longitude:-87}));
let batchId=0;const batch=ui.SurviveShotgun.buildBatch({round_id:'six-gate-check',here:{params:{origin:'41,-87',destination:'42,-88',alternatives:0}}},gates,gates,()=> 'offline-id-'+batchId++);
assert.equal(batch.requests.length,49,'six gates at each end produce the full 7 × 7 batch including no-gate choices');
console.log('Route TODO checks passed: six-gate defaults and full cross product, rendered independent-cutoff mileage in the requested position, unknown/zero distinction, strict cutoff, highway immunity, updated evidence, and unchanged ranking. No provider calls.');
