import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync('dist/index.html','utf8');
const css=readFileSync('dist/style.css','utf8');
const app=readFileSync('dist/app.js','utf8');
const worker=readFileSync('server/worker.js','utf8');

assert.match(html,/id="pool-screening-budget"[^>]*value="5"/,'the setup count defaults to 5');
assert.match(html,/id="pool-ranking-budget"[^>]*value="5"/,'the ranking review exposes the same default');
assert.match(html,/id="pool-ranking-review"[\s\S]*?id="pool-ranking-budget"[\s\S]*?id="pool-ranking-round-cost"[\s\S]*?id="prepare-pool-evolution-ranking"/,'count, cost, and action are together at the ranking');
assert.match(css,/\.pool-ranking-review \.pool-ranking-budget-label/,'the count is laid out in the sticky review');
assert.match(html,/id="manual-route-mode"[^>]*checked/,'One Round is the default mode');
assert.match(html,/id="automatic-route-pruning"[^>]*disabled/,'the three-round control is unavailable');
assert.match(html,/id="automatic-ranking-mode"[^>]*hidden/,'the three-round card is hidden');
assert.match(css,/\.ranking-mode-card\[hidden\][^{]*\{display:none\}/,'the hidden card stays hidden despite card styling');
assert.match(app,/const perRoute=evolving\?Number\(\$\('pool-screening-budget'\)\.value\):0/,'the first ranking cannot turn the default 5 into paid calls');
assert.match(app,/budget:Number\.isInteger\(savedQuota\)[^\n]*\?savedQuota:5/,'old saved counts are preserved and missing counts default to 5');
assert.match(app,/\$\('pool-screening-budget'\)\.value='5';state\.poolScreening\.budget=5;resetRankingModeForNewCandidates\(\)/,'each new route search starts at 5');
assert.match(app,/function updatePoolBudget\(source\)[\s\S]*?\$\('pool-ranking-budget'\)\.value=source\.value/,'either count input updates the other');
assert.match(app,/\$\('pool-ranking-budget'\)\.addEventListener\('input',event=>updatePoolBudget\(event\.currentTarget\)\)/,'ranking count updates the AVM estimate');
assert.match(app,/invalidatePoolPlan\('The per-route AVM cell count changed\.'\)/,'editing either count invalidates an exact plan');
assert.match(app,/function finishPoolBudgetChange\(\)[\s\S]*?if\(!state\.poolScreening\.results\.length\)schedulePoolReviewPreparation\(\)/,'a count change after ranking cannot automatically prepare or run a round');
assert.match(app,/\$\('prepare-pool-evolution-ranking'\)\.addEventListener\('click',prepareManualRankingRound\)/,'the ranking action prepares One Round');
assert.match(app,/ready\.user_approval_started=true;return sendPoolScreening\(ready\.plan_id,poolQuotaUserApprovalToken\)/,'the separate Run click starts the exact approved round');
assert.match(app,/async function prepareAutomaticRouteEvolution\(\)\{notice\('Automatic multi-round lookups are unavailable\.[^']*'\);return;/,'legacy multi-round entry cannot launch lookups');
assert.match(worker,/async function approveAvm\(body,env\)\{\s*if\(body\?\.purpose==='automatic_route_evolution'\)return json\([\s\S]*?,410\);/,'the server refuses new multi-round authorizations before a provider call');
assert.match(app,/applyCullSelection\(plan,screen\.generation\)/,'each completed One Round reranks and culls');

console.log('One Round UI, linked count, default 5, and exact approval checks passed. Actual provider calls: 0.');
