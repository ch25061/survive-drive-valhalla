import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('dist/app.js','utf8');
const html=readFileSync('dist/index.html','utf8');
const css=readFileSync('dist/style.css','utf8');

assert.match(html,/<aside id="pool-ranking-review" class="pool-ranking-review"[^>]*hidden>/);
assert.match(html,/<button id="prepare-pool-evolution-ranking"[^>]*disabled>Run one Manual round<\/button>/);
assert.match(html,/Runs one Manual round with your current per-route count and included routes\./);
assert.match(html,/<div id="primary-ranking" class="primary-ranking">[\s\S]*?<aside id="pool-ranking-review"[\s\S]*?<div id="candidate-list" class="candidate-list"><\/div><\/div>/);
assert.doesNotMatch(html,/pool-screening-results-wrap|pool-screening-results/);
assert.match(html,/Examine the rank order and evidence for every candidate\. Review the ranking, choose a per-route count, and enable the routes to sample before preparing another round\./);
assert.match(css,/\.pool-ranking-review\{[^}]*position:sticky[^}]*border:3px solid #7138c9[^}]*background:#f3ecff/s);
assert.match(css,/\.pool-evolution-controls button:disabled\{[^}]*background:#eef2f6/s);
assert.match(css,/\.pool-ranking-review button:disabled\{[^}]*background:#eef2f6/s);

assert.match(app,/function guidedScroll\(element\)[\s\S]*?prefers-reduced-motion: reduce[\s\S]*?guidedScrollIntoView\(element,\{behavior:reduced\?'auto':'smooth',block:'start',inline:'nearest'\}\)/);
assert.match(app,/function afterGuidanceLayout\(callback\)[\s\S]*?requestAnimationFrame[\s\S]*?frame\(callback\)/,'HERE and prepared-plan guidance share a two-frame layout scheduler');
assert.match(app,/function guidedPreparedPoolApprovalScroll\(element,planId\)[\s\S]*?afterGuidanceLayout\(\(\)=>\{settle\(\);if\(typeof setTimeout==='function'\)\{for\(const delay of \[160,480,1000\]\)setTimeout\(settle,delay\)/,'prepared plan correction rechecks after the shared layout scheduler and delayed expansion when timers are available');
assert.match(app,/function guidedPreparedPoolApprovalScroll\(element,planId\)[\s\S]*?state\.poolScreening\?\.plan\?\.plan_id!==planId/,'a superseded plan cannot scroll later');
assert.match(app,/function guidedPreparedPoolApprovalScroll\(element,planId\)[\s\S]*?interactionEvents=\['wheel','touchstart','pointerdown','keydown'\]/,'manual interaction cancels pending prepared-plan corrections');
assert.match(app,/function guidedPreparedPoolApprovalScroll\(element,planId\)[\s\S]*?guidedScrollIntoView\(element,\{behavior:'auto',block:rect\.height>=height\?'start':'center',inline:'nearest'\}\)/,'prepared plan approval receives an immediate visibility correction after layout settles');
assert.match(app,/function presentPoolRankingReview\(\)[\s\S]*?if\(!screen\.plan&&!modeChoiceReady\)guidedScroll\(ranking\)/,'the first Manual or Automatic choice takes scroll priority over the ranking-review cue');
assert.match(app,/finally\{endWorking\(\);screen\.preparation_phase=null;state\.busy=false;renderPoolScreening\(\);renderEvaluationFlow\(\);const preparedCue=screen\.plan\?\.purpose==='candidate_pool_quota'\?\$\('pool-screening-summary'\):\$\('approve-pool-screening'\);[\s\S]*?guidedPreparedPoolApprovalScroll\(preparedCue,preparedPlanId\);/,'only the exact plan prepared in this transition schedules the correct auto status or manual approval cue after final rendering');
assert.match(app,/editingRedCutoff=state\.stage==='evaluate'&&document\.activeElement===\$\('red-cutoff'\)/,'editing the cutoff is detected before any guided scroll');
assert.match(app,/else if\(!editingRedCutoff\)guidedScroll\(guidedNode\)/,'guided scrolling stays suppressed while the cutoff owns focus');
assert.match(app,/function notePoolRankingUpdated\(\)[\s\S]*?ranking_review_pending=true/);
assert.match(app,/function presentPoolRankingReview\(\)[\s\S]*?modeChoiceScrolled=modeChoiceReady&&presentRankingModeChoice\(\)[\s\S]*?suppressNextActionScroll=!modeChoiceReady\|\|modeChoiceScrolled/);
assert.match(app,/rankingEvolutionButton\)rankingEvolutionButton\.disabled=state\.busy\|\|!screen\.results\.length\|\|!!screen\.plan\|\|!poolRankingReviewPresented\(\)/);
assert.match(app,/\$\('prepare-pool-evolution-ranking'\)\.addEventListener\('click',prepareManualRankingRound\)/);
assert.match(app,/choose\('#prepare-pool-evolution-ranking','Review the ranking and prepare one Manual evidence round/);
assert.match(app,/Review the ranking and prepare one Manual evidence round only if more evidence would help/);

for(const marker of [
  'screen.status=\'refreshed_after_cutoff_change\';notePoolRankingUpdated();',
  'screen.results=rankPoolResults(state.routes,plan,plan?.attempt_records??[]);notePoolRankingUpdated();',
  'if(screen.results.length)notePoolRankingUpdated();renderPoolScreening();renderCandidates();renderEvaluationFlow();updateNextAction();',
  'if(state.poolScreening.results.length)notePoolRankingUpdated();renderPoolScreening();return routes;',
])assert.ok(app.includes(marker),`expected ranking-review notification: ${marker}`);
assert.match(app,/screen\.results=rankPoolResults\(state\.routes,metricPlan,metricAttempts\)\.map\(item=>\{[\s\S]*?\}\);notePoolRankingUpdated\(\)/,'selected-route and map-cell reranking must present the ranking checkpoint');

const plan={cells:[{},{},{},{},{}],attempt_records:[{},{},{}]},scrolls=[],listeners=new Map(),delayed=[];
const heading={},guidance={},ranking={getBoundingClientRect:()=>({top:950}),scrollIntoView:options=>scrolls.push(options)};
const state={poolScreening:{plan,status:'running'}};
const context={state,$:id=>({'primary-ranking':ranking,'pool-ranking-heading':heading,'pool-ranking-guidance':guidance})[id],window:{addEventListener:(name,handler)=>listeners.set(name,[...(listeners.get(name)??[]),handler]),removeEventListener:(name,handler)=>listeners.set(name,(listeners.get(name)??[]).filter(item=>item!==handler))},nextActionLayoutKey:'',setTimeout:callback=>delayed.push(callback)};
vm.createContext(context);
vm.runInContext(app.slice(app.indexOf('let guidedFocusPaused='),app.indexOf('function notePoolRankingUpdated()')),context);
vm.runInContext(app.slice(app.indexOf('function renderPoolRankingProgress('),app.indexOf('function renderPoolScreening()')),context);
context.bindGuidedFocusRespect();
context.guidedRunningPoolRanking(plan);
assert.equal(scrolls.length,1,'an approved running round should immediately show the ranking');
assert.equal(scrolls[0].block,'start');
for(const handler of [...listeners.get('wheel')])handler({});for(const callback of delayed.splice(0))callback();
assert.equal(scrolls.length,1,'manual scrolling must cancel later ranking corrections');
context.guidedRunningPoolRanking(plan);assert.equal(scrolls.length,1,'later progress renders must not recapture focus after user scrolling');
for(const handler of listeners.get('click'))handler({target:{closest:selector=>selector.includes('#send-here')?{}:null}});context.guidedRunningPoolRanking(plan);assert.equal(scrolls.length,2,'approving a HERE search restores guided focus');
for(const handler of listeners.get('scroll'))handler({});
context.guidedRunningPoolRanking(plan);
assert.equal(scrolls.length,3,'layout scrolling after a new action must not silently pause guided focus again');
for(const handler of listeners.get('wheel'))handler({});
context.guidedRunningPoolRanking(plan);
assert.equal(scrolls.length,3,'a new manual wheel gesture still pauses guided focus');
for(const handler of listeners.get('click'))handler({target:{closest:()=>({})}});
context.guidedRunningPoolRanking(plan);
assert.equal(scrolls.length,4,'another guided action re-enables focus');
context.window.innerWidth=1200;
for(const handler of listeners.get('pointerdown'))handler({clientX:1190,button:0});
for(const handler of listeners.get('scroll'))handler({});
context.guidedRunningPoolRanking(plan);
assert.equal(scrolls.length,4,'scrollbar dragging also pauses guided focus');
context.renderPoolRankingProgress();
assert.match(heading.textContent,/3 of 5 cells/);
assert.match(guidance.textContent,/route cards fill and reorder/);
state.poolScreening.status='complete';context.renderPoolRankingProgress();
assert.equal(heading.textContent,'Review this ranking');

console.log('Passed guided ranking and running-round scroll/progress checks, including manual-scroll cancellation. No provider calls.');
