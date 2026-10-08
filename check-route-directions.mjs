import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8'),html=readFileSync('dist/index.html','utf8');
assert.ok(html.indexOf('id="route-directions"')>html.indexOf('class="map-legend"'));
assert.ok(html.indexOf('id="route-directions"')<html.indexOf('id="map-notes"'));
assert.match(source,/function renderCandidates\(\)\{\s*renderRouteDirections\(\)/);
const nodes=new Map();
function node(){return{children:[],style:{},events:{},hidden:false,textContent:'',value:'',addEventListener(name,callback){this.events[name]=callback;},before(){},after(){},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(){}};}
const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
const context={document:{getElementById:get,createElement:node},fetch(){throw Error('No provider calls permitted');}};context.window=context;vm.createContext(context);
vm.runInContext(readFileSync('dist/valhalla-decoder.js','utf8'),context);
vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),context);
function encode(points){let previous=[0,0],result='';for(const p of points){const now=[Math.round(p[1]*1e6),Math.round(p[0]*1e6)];for(let i=0;i<2;i++){let value=now[i]-previous[i];value=value<0?~(value<<1):value<<1;while(value>=32){result+=String.fromCharCode((32|(value&31))+63);value>>=5;}result+=String.fromCharCode(value+63);}previous=now;}return result;}
const leg=(points,instruction)=>({shape:encode(points),summary:{time:180,length:1},maneuvers:[{begin_shape_index:0,end_shape_index:1,highway:false,instruction,length:1,time:180}]});
const response={trip:{units:'kilometers',legs:[leg([[-97,32],[-96.99,32]],'Turn right onto Main Street.'),leg([[-96.99,32],[-96.98,32]],'<img src=x onerror=alert(1)>')]},alternates:[{trip:{units:'kilometers',legs:[leg([[-97,32],[-97,32.01]],'Continue on Second Avenue.')]}}]};
const api=context.SurviveValhalla,routes=api.convertRoutes(response,'directions-fixture');
assert.equal(routes[0].route_directions.steps.length,2,'every leg retains ordered instructions');
assert.equal(routes[0].route_directions.steps[1].leg_number,2);
assert.equal(routes[0].route_directions.steps[0].length_m,1000);
assert.deepEqual(Array.from(routes[0].route_directions.steps,step=>step.shape_index),[0,1],'second leg positions use the global geometry offset and deduplicate shared endpoints');
const arrivalResponse=JSON.parse(JSON.stringify(response));arrivalResponse.trip.legs[1].maneuvers.push({instruction:'Arrive.',length:0,time:0,begin_shape_index:1,end_shape_index:1});
assert.deepEqual(Array.from(api.convertRoutes(arrivalResponse,'arrival')[0].route_directions.steps,step=>step.shape_index),[0,1,2],'arrival points at the final shape coordinate');
const separateLegs=JSON.parse(JSON.stringify(response));separateLegs.trip.legs[1].shape=encode([[-96.985,32],[-96.98,32]]);
assert.equal(api.convertRoutes(separateLegs,'separate')[0].route_directions.steps[1].shape_index,2,'non-shared leg endpoints retain their full offset');
assert.equal(routes[1].route_directions.steps[0].instruction,'Continue on Second Avenue.');
const miles=api.convertRoutes({trip:{...response.trip,units:'miles'}},'miles')[0];
assert.equal(miles.route_directions.steps[0].length_m,1609.344);
assert.equal(miles.length_m,3218.688);
const gap=JSON.parse(JSON.stringify(response));gap.trip.legs[1].maneuvers=[];
assert.equal(api.convertRoutes(gap,'gap')[0].route_directions.steps[1].instruction,null,'a missing leg remains an explicit gap instead of silently disappearing');
const subject=JSON.parse(readFileSync('dist/reference.json','utf8')).subject_profile;
const saved={schema:'survive_drive_candidate_set_v1',subject_profile:subject,routes:JSON.parse(JSON.stringify(routes))};
context.fixture=saved;
const restored=vm.runInContext('validateCandidateSet(fixture)',context);
assert.deepEqual(JSON.parse(JSON.stringify(restored[0].route_directions)),saved.routes[0].route_directions,'saved/imported candidates preserve instructions');
const old=JSON.parse(JSON.stringify(routes[0]));delete old.route_directions;
api.restoreSavedTransitions([old],[{provider:'Valhalla',round_id:'directions-fixture',response}]);
assert.equal(old.route_directions.steps[1].instruction,'<img src=x onerror=alert(1)>','older session restores directions from retained raw response');
const mismatch=JSON.parse(JSON.stringify(old));delete mismatch.route_directions;mismatch.geometry[0][0]+=.01;
api.restoreSavedTransitions([mismatch],[{provider:'Valhalla',round_id:'directions-fixture',response}]);
assert.equal(mismatch.route_directions,undefined,'mismatched geometry never acquires another route\'s directions');
assert.throws(()=>api.validateDirections({source:'valhalla',steps:[{instruction:'Go',length_m:-1,duration_s:1,leg_number:1}]}),/Invalid/);
assert.throws(()=>api.validateDirections({source:'valhalla',steps:[{instruction:'Go',length_m:1,duration_s:1,leg_number:1,shape_index:-1}]}),/Invalid/);
const state=context.SurviveDrive.getState();state.routes=restored;state.active=0;
// Exercise actual selection while isolating unrelated map/evidence UI.
vm.runInContext(`dismissMapAvm=()=>{};rememberReviewDraft=()=>{};resetAvmReview=()=>{};updateStreetView=()=>{};renderCandidates=()=>renderRouteDirections();renderMetrics=()=>{};drawMap=()=>{};renderCells=()=>{};renderChoice=()=>{};renderEvaluationFlow=()=>{};renderReviewTarget=()=>{};updateNextAction=()=>{};`,context);
context.SurviveDrive.selectRoute(0,{source:'candidate-card'});
assert.equal(get('route-directions').hidden,false);
assert.equal(get('route-directions-steps').children.length,2);
const text=element=>[element.textContent,...element.children.map(text)].join(' ');
assert.match(text(get('route-directions-steps')),/Turn right onto Main Street/);
assert.match(text(get('route-directions-steps')),/Leg 2/);
assert.match(text(get('route-directions-steps')),/0.62 mi · 3.0 min/);
assert.match(text(get('route-directions-steps')),/<img src=x onerror=alert\(1\)>/,'provider text is literal textContent');
assert.ok(get('route-directions-steps').children.every(row=>row.innerHTML===undefined));
// Click the actual button and exercise map focus, rather than duplicating its implementation.
const focused=[],markers=[],removed=[];context.mapFixture={setView(point,zoom){focused.push({point:Array.from(point),zoom});},getZoom(){return 11;},invalidateSize(){},removeLayer(marker){removed.push(marker);}};
context.L={DomEvent:{stopPropagation(event){event.stopped=true;}},divIcon(options){return options;},marker(point,options){const marker={point:Array.from(point),options,events:{},on(name,callback){this.events[name]=callback;return this;},addTo(){markers.push(this);return this;},bindTooltip(label,options){this.label=label.textContent;this.hint=label.children.at(-1)?.textContent;this.tooltip={options};return this;},getTooltip(){return this.tooltip;},openTooltip(){this.open=true;return this;},closeTooltip(){this.open=false;return this;},setZIndexOffset(offset){this.options.zIndexOffset=offset;return this;}};return marker;}};
context.viewportMoves=0;vm.runInContext('map=mapFixture;fitRouteMapToViewport=()=>{viewportMoves++;};closeRouteCellHover=()=>{};',context);
const buttons=element=>[...(element.type==='button'?[element]:[]),...element.children.flatMap(buttons)];
vm.runInContext('renderRouteDirections()',context);assert.equal(markers.length,2,'all maneuver markers appear before any direction is clicked');const [firstMarker,finalMarker]=markers;
assert.deepEqual(markers.map(marker=>marker.options.icon.html.textContent),['1','2'],'markers are pre-labeled in instruction order');assert.ok(markers.every(marker=>!marker.tooltip.options.permanent),'overview keeps compact persistent numbers and reveals full instructions on hover');
const initialButtons=buttons(get('route-directions-steps'));assert.equal(initialButtons.length,2);initialButtons[1].events.click();
assert.deepEqual(focused.at(-1),{point:[32,-96.99],zoom:17});assert.equal(context.viewportMoves,1,'click brings the main map into view');assert.match(finalMarker.label,/Step 2: <img/,'tooltip text remains literal');
initialButtons[0].events.click();assert.deepEqual(focused.at(-1).point,[32,-97]);assert.equal(removed.length,0,'focusing a turn never removes other markers');assert.equal(firstMarker.directionContent.style.background,'#075da6');assert.equal(finalMarker.directionContent.style.background,'#fff');
assert.equal(firstMarker.options.interactive,true);assert.equal(firstMarker.options.keyboard,true);assert.equal(firstMarker.options.bubblingMouseEvents,false);assert.match(firstMarker.hint,/next turn/);const markerClick={};firstMarker.events.click(markerClick);assert.equal(markerClick.stopped,true,'advancing never triggers the map AVM click handler');assert.deepEqual(focused.at(-1).point,[32,-96.99]);assert.match(finalMarker.hint,/Final maneuver/);finalMarker.events.click({});assert.deepEqual(focused.at(-1).point,[32,-96.99],'final step stays on the destination and never wraps');assert.equal(markers.length,2,'advancement reuses the complete persistent marker set');assert.equal(finalMarker.tooltip.options.permanent,true);assert.equal(firstMarker.tooltip.options.permanent,false);vm.runInContext('renderDirectionManeuvers();renderRouteDirections()',context);assert.equal(markers.length,2,'evidence or map redraws do not duplicate markers');assert.equal(removed.length,0);
context.SurviveDrive.handleCandidateCardClick(1);
assert.equal(removed.length,2,'switching routes clears every previous maneuver marker');assert.equal(markers.length,3,'new route receives its own markers immediately');const beforeStale=focused.length;initialButtons[0].events.click();firstMarker.events.click({});assert.equal(focused.length,beforeStale,'stale buttons and markers cannot focus the previous route');
assert.match(text(get('route-directions-steps')),/Second Avenue/);
assert.doesNotMatch(text(get('route-directions-steps')),/Main Street|onerror/,'route switching clears stale directions');
delete restored[1].route_directions;vm.runInContext('renderRouteDirections()',context);
assert.equal(removed.length,3,'missing directions clear the prior marker set');
assert.equal(get('route-directions-steps').children.length,0);
assert.equal(get('route-directions-empty').hidden,false);
assert.match(get('route-directions-empty').textContent,/unavailable/);
restored[1].route_directions={source:'valhalla',steps:[{instruction:'Legacy step',length_m:1,duration_s:1,leg_number:1}]};vm.runInContext('renderRouteDirections()',context);assert.equal(buttons(get('route-directions-steps'))[0].disabled,true,'a step without verified geometry is not assigned a guessed location');
state.routes=[];vm.runInContext('renderRouteDirections()',context);
assert.equal(get('route-directions').hidden,true);
assert.equal(get('route-directions-steps').children.length,0);
const coincident=JSON.parse(JSON.stringify(restored[0]));coincident.route_directions.steps[1].shape_index=0;state.routes=[coincident];state.active=0;vm.runInContext('renderRouteDirections()',context);const coincidentMarkers=markers.slice(-2);assert.deepEqual(coincidentMarkers[0].point,coincidentMarkers[1].point,'coincident maneuvers retain their actual coordinates');assert.notDeepEqual(coincidentMarkers[0].options.icon.iconAnchor,coincidentMarkers[1].options.icon.iconAnchor,'coincident labels are offset so neither is hidden');state.routes=[];vm.runInContext('renderRouteDirections()',context);
console.log('Passed route directions: provider maneuvers, alternates, multi-leg order, unit conversion, saved-session preservation/recovery, safe text, route selection, missing instructions and clearing. No provider calls.');

// Reproduce the running local preview: old markup and decoder, current app.js.
for(const id of ['route-directions','route-directions-title','route-directions-summary','route-directions-empty','route-directions-steps'])nodes.delete(id);
const legacyGet=id=>id.startsWith('route-directions')?(nodes.get(id)??null):get(id);
context.document.getElementById=legacyGet;
context.document.createElement=()=>{const element=node();element.style={};Object.defineProperty(element,'id',{set(id){this._id=id;nodes.set(id,this);},get(){return this._id;}});return element;};
let insertedAfterLegend=null;
context.document.querySelector=selector=>selector==='.map-legend'?{after(panel){insertedAfterLegend=panel;}}:null;
delete api.validateDirections;
state.hereResponses=[{provider:'Valhalla',round_id:'directions-fixture',response}];
const legacyRoutes=JSON.parse(JSON.stringify(routes));for(const route of legacyRoutes)delete route.route_directions;
state.routes=legacyRoutes;state.active=1;vm.runInContext('renderRouteDirections()',context);
assert.equal(insertedAfterLegend,legacyGet('route-directions'),'missing panel is created directly after the map legend');
assert.equal(legacyGet('route-directions').hidden,false);
assert.match(text(legacyGet('route-directions-steps')),/Second Avenue/,'retained alternate response restores actual instructions with an old decoder');
const savedWithoutPositions=JSON.parse(JSON.stringify(legacyRoutes[1]));for(const step of savedWithoutPositions.route_directions.steps)delete step.shape_index;state.routes=[savedWithoutPositions];state.active=0;vm.runInContext('renderRouteDirections()',context);assert.equal(savedWithoutPositions.route_directions.steps[0].shape_index,0,'earlier saved directions gain verified positions from their matching retained response');state.routes=legacyRoutes;
state.active=0;vm.runInContext('renderRouteDirections()',context);
assert.match(text(legacyGet('route-directions-steps')),/Main Street/);
assert.match(text(legacyGet('route-directions-steps')),/Leg 2/);
assert.doesNotMatch(text(legacyGet('route-directions-steps')),/Second Avenue/);
context.fixture={...saved,routes:legacyRoutes};
assert.equal(vm.runInContext('validateCandidateSet(fixture)[0].route_directions.steps.length',context),2,'recovered directions can be imported even with a legacy decoder');
const wrong=JSON.parse(JSON.stringify(legacyRoutes[0]));delete wrong.route_directions;wrong.geometry[0][0]+=.01;state.routes=[wrong];state.active=0;vm.runInContext('renderRouteDirections()',context);
assert.equal(wrong.route_directions,undefined);
assert.equal(legacyGet('route-directions-steps').children.length,0);
console.log('Passed mixed-version preview: missing panel creation, exact-geometry raw-response recovery, alternate selection and legacy saved-direction validation.');

if(process.argv[2]){
  const session=JSON.parse(readFileSync(process.argv[2],'utf8'));
  state.hereResponses=session.here_responses;state.routes=session.candidates.routes;
  let stepCount=0;
  for(const [index,route] of state.routes.entries()){
    delete route.route_directions;state.active=index;vm.runInContext('renderRouteDirections()',context);
    assert.ok(route.route_directions?.steps?.some(step=>step.instruction),'actual saved route '+index+' has recovered directions');
    assert.ok(route.route_directions.steps.every(step=>Number.isInteger(step.shape_index)&&step.shape_index>=0&&step.shape_index<route.geometry.length),'every actual saved maneuver has a valid map position');
    assert.equal(vm.runInContext('directionManeuverMarkers.size',context),route.route_directions.steps.length,'every actual saved instruction has a persistent marker');
    const record=session.here_responses.find(item=>[1,2,3,4].some(number=>route.id===item.round_id+'-'+number));
    const number=Number(route.id.slice(record.round_id.length+1));
    const raw=[record.response,...(record.response.alternates??[])][number-1],trip=raw.trip??raw;
    assert.deepEqual(Array.from(route.route_directions.steps,step=>step.instruction),trip.legs.flatMap(leg=>(leg.maneuvers??[]).map(step=>step.instruction??null)));
    stepCount+=route.route_directions.steps.length;
  }
  console.log('Actual saved session verified: '+state.routes.length+' routes, '+stepCount+' original turn instructions; zero provider calls.');
}
