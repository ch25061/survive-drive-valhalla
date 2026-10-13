import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const repo='';
let requests=0;const env={fetch(){requests++;throw Error('No requests allowed');}};vm.createContext(env);vm.runInContext(readFileSync(repo+'dist/guided-mode.js','utf8'),env);
const {guidanceFor,explainAction}=env.RouteGuidance;
const cases=[['prepare','pick-origin',/S means start/,/help you place D/],['prepare','pick-destination',/D means destination/,/select GO/],['prepare','map',/Placing a pin/,/placed/],['prepare','suggest-shotgun',/Route gates/,/Watch the progress/],['prepare','accept-limited-shotgun',/smaller gate set/,/search can start/],['evaluate','red-cutoff',/PPSQFT means/,/does not buy/],['evaluate','pool-screening-budget',/paid credits/,/exact number/],['evaluate','primary-ranking',/Purple means exact/,/Look around/],['inspect','streetview',/particular date/,/Choose or adjust/],['choose','choose-ranked-osmand-route',/phone navigation app/,/recorded choice/]];
for(const [stage,id,meaning,after]of cases){const state={stage};const before=JSON.stringify(state);const help=explainAction(guidanceFor(state,''),state,id);assert.match(help.meaning,meaning,id);assert.match(help.after,after,id);assert.ok(help.steps.length>=2&&help.steps.length<=3,id);assert.ok(help.stuck);assert.equal(JSON.stringify(state),before);}
let state={stage:'evaluate',poolScreening:{plan:{maximum_attempts:7}}},help=explainAction(guidanceFor(state,'Review the exact 7 requests.'),state,'prepare-pool-evolution-ranking');assert.match(help.steps.join(' '),/Do not approve/);assert.match(help.after,/Failed attempts still count/);
state={stage:'evaluate'};help=explainAction(guidanceFor(state,''),state,'prepare-pool-evolution');assert.match(help.after,/does not approve/);
state={stage:'search',busy:true};help=explainAction(guidanceFor(state,''),state,'here-result');assert.match(help.steps[0],/Wait/);
state={stage:'prepare',endpointCheck:{status:'blocked',points:[{pin:'origin',within_limit:false,nearest_road_distance_m:346.63}]}};const model=guidanceFor(state,'');help=explainAction(model,state,'pick-origin');assert.match(help.steps.join(' '),/Zoom in/);assert.equal(model.target,'#pick-origin');assert.match(model.description,/100 metres/);
assert.equal(requests,0);
const html=readFileSync(repo+'dist/index.html','utf8');for(const id of ['guided-instructions','guided-after','guided-meaning','guided-stuck','guided-dock','guided-dock-show','guided-dock-explain'])assert.match(html,new RegExp('id="'+id+'"'));assert.ok(!readFileSync(repo+'dist/guided-mode.js','utf8').includes('\uFFFD'));
console.log('Patient guide: all five stages, action-specific instructions, paid-plan boundaries, waiting, pin recovery, state preservation and zero requests passed.');
