import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('dist/index.html','utf8');
const app=fs.readFileSync('dist/app.js','utf8');
const css=fs.readFileSync('dist/style.css','utf8');

const red=html.indexOf('id="red-cutoff-group"');
const exclusion=html.indexOf('id="exclusion-zone-level-group"');
const fresh=html.indexOf('id="fresh-route-candidates-control"');
const pool=html.indexOf('id="pool-screening-controls"');
assert.ok(red>=0&&exclusion>red&&fresh>exclusion&&pool>fresh,'the prominent fresh-route action sits immediately after both conditioning sliders and before ranking controls');
assert.match(html,/id="generate-fresh-route-candidates"[^>]*class="primary fresh-route-candidates"[^>]*disabled>Generate fresh route candidates/,'the fresh route action is visually prominent and disabled until gate sets are ready');
assert.match(html,/Changing Red or Exclusion Zone settings discards the current candidate batch and its ranking/,'the panel explains that changing either level discards the batch');
assert.match(app,/function previewColorScale\([\s\S]*?if\(!upperChanged&&lower!==mapColorLower\(\)&&!discardCandidatesForFreshRouteGeneration\('Red PPSQFT level changed'\)\)return false/,'only a changed Red lower-bound preview discards the candidate batch; blocked changes are rejected');
assert.match(app,/function setExclusionZoneThreshold\(value\)[\s\S]*?if\(!discardCandidatesForFreshRouteGeneration\('Exclusion Zone level changed'\)\)return false[\s\S]*?drawRedExclusionZoneLayer\(\)/,'releasing a changed Exclusion Zone threshold discards routes and recomputes its zone preview');
assert.match(app,/function confirmRedThreshold\([\s\S]*?if\(changed&&!discardCandidatesForFreshRouteGeneration\('Red PPSQFT level changed'\)\)return false/,'applying a changed Red level also clears candidates when the slider preview event was skipped');
const discard=app.match(/function discardCandidatesForFreshRouteGeneration\(reason\)[\s\S]*?\nfunction renderFreshRouteCandidatesButton/)[0];
assert.match(discard,/state\.routes=\[\]/,'discarding clears the displayed route candidates');
assert.match(discard,/screen\.results=\[\][\s\S]*?screen\.round_zero=null[\s\S]*?screen\.cull_round=0/,'discarding clears the old rankings, baseline, and cull state');
assert.match(discard,/superseded_by_conditioning_change/,'the old prepared batch is preserved in the draft record as superseded');
assert.doesNotMatch(discard,/state\.(?:shotgunSuggestions|destinationShotgunSuggestions|hereResponses|map_cell_evidence)\s*=\s*(?:null|\[\])/,'discarding keeps Escape Gate selections, provider history, and known-cell evidence');
assert.match(app,/async function generateFreshRouteCandidates\(\)[\s\S]*?gateResolutionReady\('start'\)[\s\S]*?gateResolutionReady\('destination'\)[\s\S]*?await stageDraft\(\)/,'the button verifies both reviewed gate sets, commits the latest Red level, then prepares a new batch');
assert.match(app,/function prepareDraft\([\s\S]*?const startGates=selectedShotgunGates\('start'\),destinationGates=selectedShotgunGates\('destination'\)[\s\S]*?buildBatch\(draft,startGates,destinationGates\)/,'the fresh request is rebuilt from the same currently selected Start × Destination gates');
assert.match(app,/\$\('generate-fresh-route-candidates'\)\.addEventListener\('click',\(\)=>void generateFreshRouteCandidates\(\)\)/,'the prominent button is wired to fresh candidate generation');
assert.match(app,/else if\(state\.draft\?\.superseded_by_conditioning_change\)choose\('#generate-fresh-route-candidates'/,'guided next-step messaging points to fresh generation after a discard');
assert.match(app,/function renderMapPickControls\(\)[\s\S]*?\$\('exclusion-zone-level'\)\.disabled=routeConditioningLocked\(\)[\s\S]*?renderFreshRouteCandidatesButton\(\)/,'threshold controls and fresh generation lock while route or evidence work is active');
assert.match(css,/\.fresh-route-candidates-control[^}]*border:3px solid #006f30/,'the nearby fresh-batch panel receives a distinct prominent treatment');

console.log('Fresh route generation checks passed: Red and Exclusion changes discard old candidates and rankings, preserve selected gates and known evidence, and the new button rebuilds the route cross-product from those gates.');
