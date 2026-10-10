import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import worker from './dist/server/index.js';

const db=new DatabaseSync(':memory:');
db.exec(readFileSync('drizzle/0008_endpoint_addresses.sql','utf8'));
function prepare(sql){const statement=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return statement.get(...this.args)??null;},run(){return statement.run(...this.args);}};}
const origin='https://test.example',env={DB:{prepare},HERE_API_KEY:'must-never-be-used'};
const post=(query,headers={Origin:origin},environment=env)=>worker.fetch(new Request(origin+'/api/locations/geocode',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({query})}),environment);
const originalFetch=globalThis.fetch;
let sent=0,mode='ok',release;
const resetRate=()=>db.exec('UPDATE endpoint_geocoder_rate SET last_started_ms=0');
globalThis.fetch=async(url,options)=>{
  sent++;const target=new URL(url);
  assert.equal(target.origin,'https://geocoding.geo.census.gov');
  assert.equal(target.pathname,'/geocoder/locations/onelineaddress');
  assert.equal(target.searchParams.get('benchmark'),'Public_AR_Current');
  assert.equal(target.searchParams.get('format'),'json');
  assert.ok(target.searchParams.get('address'));
  assert.equal(target.searchParams.has('apiKey'),false);
  assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');
  assert.match(options.headers['User-Agent'],/RouteScrewtiny/);
  if(mode==='pending')await new Promise(resolve=>{release=resolve;});
  if(mode==='http')return new Response('{}',{status:503});
  if(mode==='malformed')return new Response('not JSON');
  if(mode==='badshape')return Response.json({result:{}});
  if(mode==='empty')return Response.json({result:{addressMatches:[]}});
  return Response.json({result:{addressMatches:[{matchedAddress:'305 MANSFIELD CT, BARTLETT, IL, 60103',coordinates:{y:41.91,x:-88.21}},{matchedAddress:'Alternate match',coordinates:{y:41.92,x:-88.22}},{matchedAddress:'Invalid point',coordinates:{y:100,x:0}},{matchedAddress:'',coordinates:{y:40,x:-88}}]}});
};
try{
  assert.equal((await post('305 Mansfield Ct',{})).status,403);
  for(const query of ['x','a'.repeat(101),'305 Main\u0000 St'])assert.equal((await post(query)).status,400);
  assert.equal((await post('305 Mansfield Ct',{Origin:origin},{})).status,503);
  assert.equal(sent,0);
  const response=await post('305 Mansfield Ct');assert.equal(response.status,200);
  const result=await response.json();assert.equal(sent,1);assert.equal(result.provider_calls,1);
  assert.equal(result.matches.length,2);assert.equal(result.matches[0].latitude,41.91);assert.equal(result.matches[0].longitude,-88.21);
  assert.equal(result.source,'U.S. Census Bureau');assert.equal(result.approximate,true);
  assert.equal(JSON.stringify(result).includes('must-never-be-used'),false);
  const cached=await(await post(' 305 MANSFIELD  Ct ')).json();assert.equal(cached.cached,true);assert.equal(cached.provider_calls,0);assert.equal(sent,1);
  assert.equal((await post('200 Main St')).status,429);assert.equal(sent,1);
  resetRate();mode='pending';const pending=post('200 Main St');
  for(let i=0;i<30&&!release;i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(release);assert.equal((await post('300 Main St')).status,429);assert.equal(sent,2);release();assert.equal((await pending).status,200);
  for(const [failureMode,query] of [['http','400 Main St'],['malformed','500 Main St'],['badshape','600 Main St']]){
    resetRate();mode=failureMode;const before=sent;const failed=await post(query);
    assert.equal(failed.status,502);assert.equal((await failed.json()).provider_calls,1);assert.equal(sent,before+1,'no automatic retry');
  }
  resetRate();mode='empty';const empty=await(await post('700 Main St')).json();assert.deepEqual(empty.matches,[]);
  const before=sent;assert.equal((await(await post('700 Main St')).json()).cached,true);assert.equal(sent,before,'empty results are cached too');
}finally{globalThis.fetch=originalFetch;db.close();}

const elements=new Map();
const makeElement=()=>({value:'',textContent:'',disabled:false,hidden:false,children:[],listeners:{},classList:{add(){},remove(){},toggle(){}},addEventListener(type,listener){this.listeners[type]=listener;},replaceChildren(...children){this.children=children;},append(child){this.children.push(child);},setAttribute(){},scrollIntoView(){}});
const get=id=>{if(id==='next-action'||id==='next-action-text')return null;if(!elements.has(id))elements.set(id,makeElement());return elements.get(id);};
let browserCalls=0;
const ui={document:{getElementById:get,createElement:makeElement,addEventListener(){}},fetch:async(path,options)=>{browserCalls++;assert.equal(path,'/api/locations/geocode');const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body),['query']);const query=body.query;if(query==='305 Mansfield Ct, 60103')return Response.json({matches:[{label:'305 Mansfield Ct, Bartlett, IL 60103, United States',latitude:41.91,longitude:-88.21},{label:'Mansfield Ct, Bartlett, IL',latitude:41.92,longitude:-88.22}],provider_calls:1});assert.equal(query,'200 Main St, 60103');return Response.json({matches:[{label:'200 Main St, Bartlett, IL',latitude:41.97,longitude:-88.19}],provider_calls:1});}};
ui.window=ui;vm.createContext(ui);
vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),ui);
const app=ui.SurviveDrive,state=app.getState();
get('origin-address').value='305 Mansfield Ct';get('origin-zip').value='60103';
assert.equal(browserCalls,0);
await app.findAddress('origin');
assert.equal(browserCalls,1);assert.equal(get('origin-address-results').children.length,2);
assert.equal(get('origin').value,'41.91,-88.21');assert.equal(get('origin-address').value,'305 Mansfield Ct');assert.equal(get('origin-zip').value,'60103');
assert.equal(get('destination').value,'');
assert.equal(get('origin-name').value,'305 Mansfield Ct, Bartlett, IL 60103, United States');
assert.equal(get('origin-address-results').children[0].disabled,true);
get('origin-address-results').children[1].listeners.click();assert.equal(get('origin').value,'41.92,-88.22');
get('destination-address').value='200 Main St';get('destination-zip').value='60103';await app.findAddress('destination');
assert.equal(get('destination').value,'41.97,-88.19');assert.equal(get('destination-name').value,'200 Main St, Bartlett, IL');
assert.equal(state.providerCalls.Geocode,2);assert.equal(state.providerCalls.HERE??0,0);
app.bindTripPointControls();get('origin-address').value='Different address';get('origin-address').listeners.input();
assert.equal(get('origin').value,'');
get('origin').value='41.91,-88.21';get('origin-name').value='Custom label';get('origin-name').listeners.input();assert.equal(get('origin').value,'41.91,-88.21');

const callsBeforeLock=browserCalls;state.poolScreening.automatic_evolution_status='running';await app.findAddress('destination');assert.equal(browserCalls,callsBeforeLock,'locked route conditioning blocks lookups');state.poolScreening.automatic_evolution_status='idle';
const validZip=get('origin-zip').value;for(const zip of ['', '1234', 'ABCDE', '123456789']){get('origin-zip').value=zip;const before=browserCalls;await app.findAddress('origin');assert.equal(browserCalls,before);assert.match(get('origin-address-status').textContent,/ZIP/);}get('origin-zip').value=validZip;
get('origin-zip').value='60104';get('origin-zip').listeners.input();assert.equal(get('origin').value,'','ZIP edits clear old coordinates');get('origin-zip').value='60103';
let resolveLate;ui.fetch=()=>{browserCalls++;return new Promise(resolve=>{resolveLate=resolve;});};
get('origin-address').value='800 Main St';const late=app.findAddress('origin');
get('origin-address').value='900 Main St';get('origin-address').listeners.input();
resolveLate(Response.json({matches:[{label:'Old result',latitude:40,longitude:-90}],provider_calls:1}));await late;
assert.equal(get('origin').value,'','a late result cannot overwrite an edited address');
get('origin-address').value='950 Main St';const zipLate=app.findAddress('origin');get('origin-zip').value='60104';get('origin-zip').listeners.input();resolveLate(Response.json({matches:[{label:'Old ZIP result',latitude:40,longitude:-90}],provider_calls:1}));await zipLate;assert.equal(get('origin').value,'','a late result cannot overwrite an edited ZIP');
get('origin-address').value='1000 Main St';const mapLate=app.findAddress('origin');
app.setTripPoint('origin',[42,-89]);resolveLate(Response.json({matches:[{label:'Old result',latitude:40,longitude:-90}],provider_calls:1}));await mapLate;
assert.equal(get('origin').value,'42,-89','map-picked coordinates survive a late lookup');
ui.fetch=async()=>Response.json({matches:[],provider_calls:1});get('destination-address').value='No match street';get('destination-address').listeners.input();await app.findAddress('destination');assert.equal(get('destination').value,'');assert.match(get('destination-address-status').textContent,/No address matches/);
assert.equal(state.providerCalls.HERE??0,0);assert.equal(state.providerCalls.Valhalla,0);assert.equal(state.providerCalls.RentCast,0);assert.equal(state.routes.length,0);

// ZIP+4 is sent as part of the bounded query; Enter works from either input.
ui.fetch=async(path,options)=>{assert.equal(JSON.parse(options.body).query,'4600 Silver Hill Rd, 20746-0001');return Response.json({matches:[{label:'4600 SILVER HILL RD, SUITLAND, MD, 20746',latitude:38.846,longitude:-76.931}],provider_calls:1});};
get('origin-address').value='4600 Silver Hill Rd';get('origin-zip').value='20746-0001';await app.findAddress('origin');assert.equal(get('origin-zip').value,'20746-0001');
assert.ok(get('origin-zip').listeners.keydown);assert.ok(get('destination-zip').listeners.keydown);
let enterPrevented=false;get('origin-zip').listeners.keydown({key:'Enter',preventDefault(){enterPrevented=true;}});for(let i=0;i<20&&get('find-origin-address').disabled;i++)await new Promise(resolve=>setTimeout(resolve,0));assert.equal(enterPrevented,true);
vm.runInContext('routeOptionsFromForm=()=>({});',ui);const setup=vm.runInContext("captureTripSetup()",ui);assert.equal(setup.origin_street_address,'4600 Silver Hill Rd');assert.equal(setup.origin_zip,'20746-0001');
get('origin-address').value='';get('origin-zip').value='';ui.restoreTripSetup({trip_setup:setup});assert.equal(get('origin-address').value,'4600 Silver Hill Rd');assert.equal(get('origin-zip').value,'20746-0001');
ui.restoreTripSetup({trip_setup:{origin:'41.91,-88.21',origin_address:'305 Mansfield Ct, Bartlett, IL 60103, United States'}});assert.equal(get('origin-address').value,'305 Mansfield Ct');assert.equal(get('origin-zip').value,'60103','older full-address sessions are split on import');
const page=readFileSync('dist/index.html','utf8');
for(const target of ['origin','destination']){assert.match(page,new RegExp('<label>Street address<input id="'+target+'-address"'));assert.match(page,new RegExp('<label>ZIP code<input id="'+target+'-zip"'));assert.match(page,new RegExp('<button id="find-'+target+'-address" type="button" class="secondary address-find">'));}
console.log('Address lookup passed: separate Street and ZIP fields, validated ZIP/ZIP+4, combined queries, ZIP edit reset and stale protection, Enter bindings, session persistence and older-session import. Existing Census cache/rate, no-retry, selection and route-lock checks also passed. All external responses mocked; no routing or AVM calls.');
