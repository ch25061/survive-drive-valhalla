import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';

const elements=new Map();let requests=0;
function element(){return{children:[],listeners:{},attributes:{},hidden:false,checked:false,classList:{toggle(){}},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=[...items];},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(name,value){this.attributes[name]=value;},toggleAttribute(name,force){if(name==='hidden')this.hidden=force;},focus(){},click(){this.listeners.click?.({stopPropagation(){}});}};}
const ui={document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element},fetch(){requests++;throw Error('Family display must never send requests');}};ui.window=ui;
vm.createContext(ui);vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),ui);
const app=ui.SurviveDrive,state=app.getState(),metres=111320;
assert.deepEqual(JSON.parse(JSON.stringify(app.getRouteFamilyParameters())),{overlapPercent:80,distanceMeters:200},'new pages use the requested defaults');
app.setRouteFamilyParameters({overlapPercent:90,distanceMeters:60});
const route=(id,points)=>({id,name:id,geometry:points.map(([x,y])=>[x/metres,y/metres]),length_m:10000,duration_s:1800,cells:[]});
const base=route('base',[[0,0],[10000,0]]),duplicate=route('duplicate',[[0,0],[5000,0],[10000,0]]),minor=route('minor',[[0,0],[4500,0],[4750,80],[5000,0],[10000,0]]),distinct=route('distinct',[[0,0],[1500,1000],[8500,1000],[10000,0]]),reverse=route('reverse',[[10000,0],[0,0]]),missing={id:'missing',name:'missing',cells:[]},broken=route('broken',[[0,0],[0,0]]);
const cards=routes=>routes.map((route,index)=>({route,index,screening:{rank:index+1}}));
const groups=routes=>Array.from(app.buildRouteFamilies(cards(routes)),f=>Array.from(f.members,c=>c.route.id));
assert.deepEqual(groups([base,duplicate,minor,distinct,reverse,missing,broken]),[['base','duplicate','minor'],['distinct'],['reverse'],['missing'],['broken']]);
// Geometry must drive grouping: sharing all AVM cells does not merge corridors.
base.cells=distinct.cells=[{cell_id:'same-coarse-cell'}];assert.equal(groups([base,distinct]).length,2);
// Both directions of overlap matter; a short subpath cannot stand in for a trip.
assert.equal(groups([base,route('short',[[0,0],[1000,0]])]).length,2);
const longLoop=route('loop',[[0,0],[5000,0],[5000,2000],[5000,0],[10000,0]]);assert.equal(groups([base,longLoop]).length,2);
// Avoid transitive chains: C resembles B but is too far from representative A.
const parallel=y=>route('parallel-'+y,[[0,0],[1000,y],[9000,y],[10000,0]]);
assert.deepEqual(groups([base,parallel(50),parallel(100)]),[['base','parallel-50'],['parallel-100']]);
const mutation=route('mutated',[[0,0],[10000,0]]);assert.equal(groups([base,mutation]).length,1);mutation.geometry[1][1]=2000/metres;assert.equal(groups([base,mutation]).length,2,'in-place geometry changes invalidate cached profiles');
const datelineA={...base,id:'date-a',geometry:[[179.99,40],[-179.99,40]]},datelineB={...base,id:'date-b',geometry:[[179.99,40],[180,40],[-179.99,40]]};assert.equal(groups([datelineA,datelineB]).length,1);
const invalid={...base,id:'invalid',geometry:[[0,0],[NaN,1]]};assert.equal(groups([base,invalid]).length,2);
// Independent controls must affect grouping, including cached comparisons.
assert.deepEqual(JSON.parse(JSON.stringify(app.getRouteFamilyParameters())),{overlapPercent:90,distanceMeters:60});
assert.equal(groups([base,minor]).length,1);
elements.get('route-family-overlap').value='100';elements.get('route-family-overlap').listeners.input({currentTarget:elements.get('route-family-overlap')});
assert.equal(app.getRouteFamilyParameters().distanceMeters,60);assert.equal(groups([base,minor]).length,2,'stricter overlap invalidates the pair-match cache');assert.equal(elements.get('route-family-overlap-value').textContent,'100%');
app.setRouteFamilyParameters({overlapPercent:90});assert.equal(groups([base,minor]).length,1);
assert.equal(groups([base,parallel(50)]).length,1);
elements.get('route-family-distance').value='20';elements.get('route-family-distance').listeners.input({currentTarget:elements.get('route-family-distance')});
assert.equal(app.getRouteFamilyParameters().overlapPercent,90);assert.equal(groups([base,parallel(50)]).length,2,'smaller tolerance invalidates spatial profiles');assert.equal(elements.get('route-family-distance-value').textContent,'20 m');
app.setRouteFamilyParameters({distanceMeters:250});assert.equal(groups([base,parallel(200)]).length,1,'spatial index expands with a larger tolerance');
app.setRouteFamilyParameters({distanceMeters:0});assert.equal(groups([base,duplicate]).length,1,'zero tolerance permits numerically identical paths');assert.equal(groups([base,parallel(50)]).length,2);
for(const parameters of [{overlapPercent:49},{overlapPercent:101},{overlapPercent:90.5},{distanceMeters:-1},{distanceMeters:501},{distanceMeters:NaN},{distanceMeters:Infinity}])assert.throws(()=>app.setRouteFamilyParameters(parameters),/Route-family overlap/);
app.setRouteFamilyParameters({overlapPercent:90,distanceMeters:60});

for(const name of ['renderRouteDirections','renderMetrics','renderCells','renderChoice','renderEvaluationFlow','renderPoolScreening','updateNextAction','automaticRouteEvidenceSummary'])ui[name]=()=>null;
let directionRenders=0;ui.renderRouteDirections=()=>directionRenders++;
ui.routeChoiceAllowed=()=>true;ui.routeDescriptor=(r,index)=>'Route '+(index+1);ui.routeGateLabel=()=> 'Start gate / Destination gate';ui.knownExclusionZoneDistance=()=>0;
ui.automaticRouteEvidenceSummary=r=>r.id==='base'?'Existing evidence details':null;
const routes=[base,duplicate,minor,distinct];state.routes=routes;state.active=1;state.poolScreening.enabled_route_ids=['base','duplicate','distinct'];
state.poolScreening.results=routes.map((r,i)=>({route_id:r.id,rank:i+1,red_distance_m:0,unknown_distance_m:i===2?100:0,ranking_score_minutes:30+i,estimated_orange_miles:i/10,known_coverage_label:'90%',weighted_mean_ppsqft:null}));
state.choice={candidate_id:'duplicate'};state.poolScreening.plan={status:'prepared',selected_cells:[{cell_id:'approved-only'}],maximum_attempts:1};
const original=JSON.stringify({routes:state.routes,results:state.poolScreening.results,enabled:state.poolScreening.enabled_route_ids,choice:state.choice,plan:state.poolScreening.plan,providerCalls:state.providerCalls});
const list=elements.get('candidate-list')??ui.document.getElementById('candidate-list');ui.renderCandidates();
assert.equal(app.getCandidateDisplayMode(),'ranked');assert.equal(list.children.length,4);
elements.get('toggle-route-family-display').click();assert.equal(app.getCandidateDisplayMode(),'families');assert.equal(list.children.length,2,'collapsed display uses two cards rather than four');
assert.equal(directionRenders,1,'display switching does not refresh direction panels or trigger their address lookups');
assert.equal(state.active,1);assert.equal(list.children[0].children[1].children[0].attributes['aria-pressed'],'false','selected member does not replace the best-ranked representative');
assert.equal(list.children[0].children[1].children[0].children[1].textContent,'base');assert.match(list.children[0].children[2].textContent,/selected #2/,'collapsed family identifies the selected member among other routes');
assert.match(list.children[0].children[0].textContent,/best #1/);assert.match(elements.get('ranking-visible-count').textContent,/2 families · 4 of 4/);
assert.equal(JSON.stringify({routes:state.routes,results:state.poolScreening.results,enabled:state.poolScreening.enabled_route_ids,choice:state.choice,plan:state.poolScreening.plan,providerCalls:state.providerCalls}),original,'view switching never mutates route or evidence state');
assert.equal(elements.get('route-family-parameters').hidden,false);
app.setRouteFamilyParameters({overlapPercent:100});app.setRouteFamilyParameters({distanceMeters:25});
assert.equal(JSON.stringify({routes:state.routes,results:state.poolScreening.results,enabled:state.poolScreening.enabled_route_ids,choice:state.choice,plan:state.poolScreening.plan,providerCalls:state.providerCalls}),original,'slider edits never mutate ranking, selection, choice, or approved evidence plans');
assert.equal(directionRenders,1,'slider edits do not trigger direction refreshes');app.setRouteFamilyParameters({overlapPercent:90,distanceMeters:60});
let family=list.children[0],top=family.children[1],details=top.children[2],topBadge=top.children[0].children[4],autoNote=top.children[0].children[5],expand=family.children[2],members=family.children[3];
assert.equal(details.textContent,'Show full details');assert.equal(details.attributes['aria-expanded'],'false');assert.equal(autoNote.hidden,true);assert.doesNotMatch(topBadge.textContent,/Known Exclusion Zone/);
details.click();assert.equal(details.textContent,'Hide full details');assert.equal(details.attributes['aria-expanded'],'true');assert.equal(top.className,'candidate-card-wrap');assert.match(topBadge.textContent,/Known Exclusion Zone/);assert.equal(autoNote.hidden,false);assert.equal(members.hidden,true,'top details and other routes expand independently');assert.equal(state.active,1,'expanding details does not select the top route');assert.equal(directionRenders,1,'detail expansion does not refresh direction panels');
assert.equal(JSON.stringify({routes:state.routes,results:state.poolScreening.results,enabled:state.poolScreening.enabled_route_ids,choice:state.choice,plan:state.poolScreening.plan,providerCalls:state.providerCalls}),original,'detail expansion preserves all route and evidence state');
ui.renderCandidates({displayOnly:true});assert.equal(list.children[0].children[1].children[2].attributes['aria-expanded'],'true','top details stay expanded after a display rerender');
family=list.children[0];top=family.children[1];details=top.children[2];topBadge=top.children[0].children[4];autoNote=top.children[0].children[5];expand=family.children[2];members=family.children[3];
details.click();assert.equal(details.attributes['aria-expanded'],'false');assert.match(top.className,/family-candidate/);assert.equal(autoNote.hidden,true);
expand.click();assert.equal(members.hidden,false);assert.equal(expand.attributes['aria-expanded'],'true');assert.equal(members.children.length,2);assert.match(members.children[0].children[0].children.at(-1).textContent,/Selected · Pool rank 2/);assert.equal(members.children[0].children[0].attributes['aria-pressed'],'true');assert.match(members.children[1].children[0].children.at(-1).textContent,/Provisional rank 3/);
ui.renderCandidates({displayOnly:true});assert.equal(list.children[0].children[1].children[2].attributes['aria-expanded'],'false');
ui.selectRoute=(index)=>{state.active=index;ui.renderCandidates();return true;};members.children[1].children[0].click();assert.equal(state.active,2,'expanded route buttons retain original route indices');assert.equal(list.children[0].children[3].hidden,false,'expansion survives rerender');
assert.equal(list.children[0].children[1].children[0].children[1].textContent,'base','selecting another family member never promotes it above the best rank');assert.match(list.children[0].children[3].children[1].children[0].children.at(-1).textContent,/Selected · Provisional rank 3/);
state.poolScreening.results[2].rank=6;ui.renderCandidates({displayOnly:true});assert.match(list.children[0].children[1].children[0].children[4].textContent,/Pool rank 1/,'rank 1 stays on top when rank 6 is selected');assert.match(list.children[0].children[2].textContent,/selected #6/);assert.match(list.children[0].children[3].children[1].children[0].children.at(-1).textContent,/Selected · Provisional rank 6/);state.poolScreening.results[2].rank=3;
state.active=0;ui.renderCandidates({displayOnly:true});assert.match(list.children[0].children[1].children[0].children[4].textContent,/Selected · Pool rank 1/,'best-ranked selection is marked on the top card');state.active=2;ui.renderCandidates({displayOnly:true});
let inclusion;ui.setPoolRouteEnabled=(id,enabled)=>{inclusion={id,enabled};};list.children[0].children[3].children[1].children[1].click();assert.deepEqual(inclusion,{id:'minor',enabled:true},'include control targets only the displayed route, not its family');
elements.get('hide-disabled-routes').checked=true;ui.renderCandidates();assert.match(elements.get('ranking-visible-count').textContent,/3 of 4 routes shown · selected map route is hidden/);assert.equal(state.active,2);assert.deepEqual(Array.from(state.poolScreening.enabled_route_ids),['base','duplicate','distinct']);
elements.get('hide-disabled-routes').checked=false;ui.renderCandidates();assert.match(elements.get('ranking-visible-count').textContent,/4 of 4/);
state.poolScreening.results[3].rank=1;state.poolScreening.results[0].rank=2;state.poolScreening.results[1].rank=3;state.poolScreening.results[2].rank=4;ui.renderCandidates();assert.match(list.children[0].children[1].children[0].children[1].textContent,/distinct/,'families follow their best current rank after reranking');
elements.get('toggle-route-family-display').click();assert.equal(app.getCandidateDisplayMode(),'ranked');assert.equal(list.children.length,4);assert.match(list.children[0].children[0].children[1].textContent,/distinct/);assert.equal(state.active,2);
assert.equal(elements.get('route-family-parameters').hidden,true);assert.deepEqual(JSON.parse(JSON.stringify(app.getRouteFamilyParameters())),{overlapPercent:90,distanceMeters:60});
state.busy=true;app.setCandidateDisplayMode('families');assert.equal(list.children[1].children[1].children[1].disabled,true);list.children[0].children[1].children[0].click();assert.equal(state.active,2,'existing busy selection guard still applies');state.busy=false;
state.poolScreening.results=[];ui.renderCandidates();assert.equal(elements.get('ranking-display-controls').hidden,false,'family view is available before AVM ranking');assert.equal(elements.get('hide-disabled-routes').disabled,true);
state.routes=[];ui.renderCandidates();assert.equal(list.children.length,0);assert.equal(elements.get('ranking-display-controls').hidden,true);

const pool=Array.from({length:292},(_,i)=>route('load-'+i,[[0,0],[2500,Math.floor(i/20)*200],[7500,Math.floor(i/20)*200],[10000,0]]));
const start=performance.now(),large=groups(pool),elapsed=performance.now()-start;assert.ok(large.length>1&&large.length<292);assert.ok(elapsed<5000,'292-route grouping remains practical');
assert.equal(requests,0);
console.log('Route families passed: geometric overlap, distinct corridors, direction, short/loop/invalid paths, dateline, cache invalidation, non-transitive grouping, compact/expanded display, selection, inclusion, filters, reranking, busy guards, empty/unranked pools, and 292 routes ('+elapsed.toFixed(0)+' ms). Network/provider calls: 0.');
