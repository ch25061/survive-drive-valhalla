import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import worker from './dist/server/index.js';

const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,hidden:false,addEventListener(){}});return elements.get(id);};
const ui={URL,document:{getElementById:get,querySelectorAll:()=>[]}};ui.window=ui;vm.createContext(ui);
for(const file of ['shotgun-gates.js','app.js'])vm.runInContext(readFileSync('dist/'+file,'utf8').replace(/\ninit\(\);\s*$/,''),ui);
const shotgun=ui.SurviveShotgun,html=readFileSync('dist/index.html','utf8');
assert.match(html,/id="shotgun-inner"[^>]*max="19"[^>]*value="1.5"/);
assert.match(html,/id="shotgun-outer"[^>]*max="20"[^>]*value="3"/);
get('origin').value='41.9,-87.7';get('destination').value='42,-87.6';get('shotgun-inner').value='19';get('shotgun-outer').value='20';get('shotgun-spacing').value='.75';get('shotgun-count').value='8';
assert.equal(ui.gateSettingsAndPointsValid(),true,'Generate accepts the 19/20 band');
for(const [inner,outer] of [[19.25,20],[19,20.25],[19,19],[19,18]]){get('shotgun-inner').value=String(inner);get('shotgun-outer').value=String(outer);assert.equal(ui.gateSettingsAndPointsValid(),false);}
ui.restoreTripSetup({trip_setup:{origin:'41.9,-87.7',destination:'42,-87.6',escape:{inner_miles:19,outer_miles:20}}});
assert.equal(get('shotgun-inner').value,'19');assert.equal(get('shotgun-outer').value,'20');
assert.equal(ui.captureTripSetup().escape.inner_miles,19);assert.equal(ui.captureTripSetup().escape.outer_miles,20);
ui.restoreTripSetup({trip_setup:{escape:{inner_miles:19.25,outer_miles:20.25}}});assert.equal(get('shotgun-inner').value,'19');assert.equal(get('shotgun-outer').value,'20');

const db=new DatabaseSync(':memory:');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const statement=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return statement.get(...this.args)??null;},execute(){if(statement.columns().length)return{results:statement.all(...this.args)};statement.run(...this.args);return{results:[]};}};}
const env={DB:{prepare,batch:statements=>statements.map(s=>s.execute())}},origin='https://test.example';
const post=(path,body)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
const priorFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Live requests are forbidden in this check');};
try{
  for(const center of [[41.9,-87.7],[42,-87.6]]){
    const subject={origin:center,outer_miles:20},small=await (await post('/api/intersections/lookup',{...subject,outer_miles:5})).json();
    const lookup=await post('/api/intersections/lookup',subject),page=await lookup.json();assert.equal(lookup.status,200);assert.equal(page.radius_m,32187);assert.notEqual(page.page_id,small.page_id);
    const response=await post('/api/intersections/construct',subject),claim=await response.json();assert.equal(response.status,200);assert.equal(claim.radius_m,32187);assert.equal(claim.census_request.maximum_response_bytes,5*1024*1024);
    assert.equal(ui.censusRequestUrl(claim.census_request,claim,{...subject,page_id:claim.page_id}),claim.census_request.url,'client validates the expanded descriptor');
    const geometry=JSON.parse(new URL(claim.census_request.url).searchParams.get('geometry'));assert.equal(geometry.paths.length,32);
    const scale=111320*Math.cos(center[0]*Math.PI/180);
    const features=Array.from({length:8},(_,i)=>{const angle=i*Math.PI/4;return{attributes:{NAME:'Test road '+i},geometry:{paths:[[18,22].map(miles=>[center[1]+miles*1609.344*Math.sin(angle)/scale,center[0]+miles*1609.344*Math.cos(angle)/111320])]}};});
    const ingested=await post('/api/intersections/ingest',{page_id:claim.page_id,claim_id:claim.claim_id,origin:claim.origin,outer_miles:20,census_payload:{features}}),result=await ingested.json();assert.equal(ingested.status,200);
    const catalog=shotgun.validateCatalog(result.catalog);assert.equal(ui.catalogCovers(center,20,catalog),true);assert.equal(ui.catalogCovers(center,20,{coverage:{center,radius_m:8047,exhaustive:true}}),false);
    const gates=shotgun.suggestGates(catalog,center,{inner_miles:19,outer_miles:20,maximum:8,sectors:8});assert.equal(gates.gates.length,8);assert.ok(gates.gates.every(g=>g.distance_m>=19*shotgun.MILE_M&&g.distance_m<=20*shotgun.MILE_M));
    for(const [inner,outer] of [[19.25,20],[19,20.25],[19,19]])assert.throws(()=>shotgun.suggestGates(catalog,center,{inner_miles:inner,outer_miles:outer}),/inner smaller/);
    const cached=await (await post('/api/intersections/construct',subject)).json();assert.equal(cached.cached,true);assert.equal(cached.source_calls,0);
  }
  for(const radius of [20.25,0.25,-1,'invalid']){const response=await post('/api/intersections/lookup',{origin:[41.9,-87.7],outer_miles:radius});assert.equal(response.status,400);assert.equal((await response.json()).source_calls,0);}
  const subject={origin:[40,-85],outer_miles:20},claim=await (await post('/api/intersections/construct',subject)).json();
  const incomplete=await post('/api/intersections/ingest',{...subject,page_id:claim.page_id,claim_id:claim.claim_id,census_payload:{features:[],exceededTransferLimit:true}});assert.equal(incomplete.status,502);assert.equal((await incomplete.json()).failure_code,'census_incomplete_or_oversized');
  assert.equal((await (await post('/api/intersections/lookup',subject)).json()).status,'missing');assert.equal((await post('/api/intersections/construct',subject)).status,409,'incomplete data cannot silently retry');
  assert.equal(calls,0);console.log('Passed 19/20-mile controls, validation, session recovery, both endpoint catalogs and gates, distinct radius cache keys, cached reuse, and incomplete-data/no-retry guards. Live provider calls: 0.');
}finally{globalThis.fetch=priorFetch;db.close();}
