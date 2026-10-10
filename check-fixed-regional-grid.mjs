import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import worker from './dist/server/index.js';

const db=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
const queries=[],requests=[];let providerCalls=0,credentialReads=0;
function prepare(sql){queries.push(sql);const stmt=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return stmt.get(...this.args)??null;},all(){return{results:stmt.all(...this.args)};},execute(){if(stmt.columns().length)return this.all();stmt.run(...this.args);return{results:[]};}};}
const env={DB:{prepare,batch:items=>items.map(item=>item.execute())},get RENTCAST_API_KEY(){credentialReads++;throw Error('No credentials permitted');}};
const api=async(path,body)=>{requests.push(path);return worker.fetch(new Request('https://offline.test'+path,{method:'POST',headers:{Origin:'https://offline.test','Content-Type':'application/json'},body:JSON.stringify(body)}),env);};
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',style:{},disabled:false,hidden:false,listeners:{},classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},removeAttribute(){},replaceChildren(){},append(){},focus(){}});return elements.get(id);};
const ui={crypto:webcrypto,TextEncoder,document:{getElementById:get,querySelectorAll:()=>[]},fetch:async(path,options)=>api(path,JSON.parse(options.body)),clearTimeout(){},setTimeout(){return 1;}};ui.window=ui;vm.createContext(ui);
vm.runInContext(readFileSync('dist/route-avm.js','utf8'),ui);vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),ui);
vm.runInContext(`notice=()=>{};log=message=>state.history.push(message);drawMap=()=>{};renderCandidates=()=>{};renderMetrics=()=>{};renderCells=()=>{};renderChoice=()=>{};renderEvaluationFlow=()=>{};renderPoolScreening=()=>{};renderRedThreshold=()=>{};renderExclusionZoneLevel=()=>{};updateNextAction=()=>{};`,ui);
const avm=ui.SurviveAvm,app=ui.SurviveDrive,state=app.getState(),plain=value=>JSON.parse(JSON.stringify(value));
const route=geometry=>({id:'offline',name:'Offline fixed-grid test',geometry,cells:[],length_m:2000,duration_s:120,live_valhalla:true,authority_source:'valhalla_maneuvers_v1',authority_ranges:[]});
const subject='rentcast-value-v1|Single Family|3bed|2bath|1500sqft|lookup=false',schema='survive_drive_avm_cache_v1';
const profile={propertyType:'Single Family',bedrooms:'3',bathrooms:'2',squareFootage:'1500',lookupSubjectAttributes:false};
function seed(cell,value){db.prepare('INSERT INTO avm_cache(cache_key,cell_id,latitude,longitude,subject_profile,provider,estimate_ppsqft,source_kind,source_artifact,acquired_at,cached_at,schema_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(JSON.stringify([schema,'RentCast',cell.cell_id,cell.latitude,cell.longitude,subject]),cell.cell_id,cell.latitude,cell.longitude,subject,'RentCast',value,'offline-fixture','original-test-provenance','2026-09-01','2026-09-02',schema);}
const originalFetch=globalThis.fetch;globalThis.fetch=()=>{providerCalls++;throw Error('Live network forbidden');};
try{
  const routes=[route([[-81.80,26.35],[-81.80,26.45]]),route([[-81.80,26.43],[-81.80,26.70]]),route([[-81.80,26.70],[-81.80,26.43]])];
  const target=plain(avm.cellAt(26.43,-81.80));for(const item of routes){assert.deepEqual(plain(avm.cellAt(26.43,-81.80,item)),target);assert.equal(avm.gridForRoute(item).grid_version,'CHI1K-V1');}
  for(const [lat,lon]of [[26.43,-81.8],[42.36,-71.06],[32.72,-117.16],[21.31,-157.86],[61.22,-149.9],[47.61,-122.33],[40.71,-74.01]]){
    const cell=avm.cellAt(lat,lon);assert.equal(cell.grid_version,'CHI1K-V1');const response=await api('/api/honeycomb/construct',{grid_version:cell.grid_version,cells:[cell]});assert.equal(response.status,200,await response.clone().text());
  }
  const mapped=avm.mapRoute(routes[0]),grid=avm.gridForRoute(routes[0]),points=routes[0].geometry.map(p=>grid.forward(...p));
  const length=Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]);assert.ok(Math.abs(mapped.cells.reduce((sum,c)=>sum+c.outside_here_distance_m,0)-length)<1e-5,'tessellation counts every meter once');
  const oldGrid='REG1K-V1-LAT+26-LON-82',old=avm.cellFromIdentity(oldGrid,-8,55),secondOld=avm.cellFromIdentity('REG1K-V1-LAT+27-LON-82',56,-73);
  seed(old,321);seed(secondOld,456);seed(target,654);const cacheBefore=db.prepare('SELECT * FROM avm_cache ORDER BY cache_key').all();
  const cached=await(await api('/api/cache/lookup',{subject_profile:subject,cells:[old,secondOld,target]})).json();assert.ok(cached.entries.every(row=>row.status==='hit'));assert.deepEqual(cached.entries.map(row=>row.entry.estimate_ppsqft),[321,456,654]);
  const known=await(await api('/api/cache/known-cells',{})).json();assert.equal(known.cells.length,3);for(const cell of known.cells){const canonical=avm.cellFromIdentity(cell.grid_version,cell.q,cell.r);assert.deepEqual(plain(cell.polygon),plain(canonical.polygon));}
  const oldRoute=route([[-82.005,26],[-81.995,26]]);oldRoute.retained_grid_version=oldGrid;Object.assign(oldRoute,avm.mapRoute(oldRoute));for(const cell of oldRoute.cells){cell.estimate_ppsqft=321;cell.value_origin='original-value';cell.acquired_at='2026-09-01';cell.source_artifact='original-provenance';}
  const originalCells=plain(oldRoute.cells),oldSnapshot={schema:'survive_drive_candidate_set_v1',subject_profile:profile,routes:[plain(oldRoute)]};
  const imported=app.loadSavedRoutes(oldSnapshot);assert.equal(imported[0].retained_grid_version,oldGrid);state.routes=imported;state.active=0;
  await app.ensureRouteCoverage(imported[0]);for(const cell of imported[0].cells){const original=originalCells.find(row=>row.cell_id===cell.cell_id);for(const field of ['cell_id','latitude','longitude','estimate_ppsqft','acquired_at','source_artifact'])assert.equal(cell[field],original[field]);}
  const reimported=app.loadSavedRoutes({schema:'survive_drive_candidate_set_v1',subject_profile:profile,routes:plain(imported)});assert.equal(reimported[0].retained_grid_version,oldGrid,'export/import retains cache-compatible grid');
  assert.deepEqual(plain(app.validateMapCellEvidence([{...old,estimate_ppsqft:321,source_artifact:'keep-me'}]))[0].polygon,plain(old.polygon));
  const forged=plain(oldSnapshot);forged.routes[0].cells[0].latitude+=.001;assert.throws(()=>app.loadSavedRoutes(forged),/original grid/);
  state.routes=[];state.active=0;
  const rendered=[],make=(kind,points,options)=>({kind,points,options,addTo(){rendered.push(this);return this;},bindTooltip(label){this.tooltip=label;return this;},on(){return this;}});
  ui.L={polygon:(p,o)=>make('hex',p,o),circleMarker:(p,o)=>make('point',p,o)};
  for(const cell of known.cells)ui.avmCellLayer(cell,{fillColor:'#abc'}).addTo({});
  assert.equal(rendered.filter(layer=>layer.kind==='hex').length,1);assert.equal(rendered.filter(layer=>layer.kind==='point').length,2);assert.deepEqual(plain(rendered.find(layer=>layer.kind==='point').points),[old.latitude,old.longitude]);
  state.routes=imported;assert.equal(ui.cellUsesDisplayedGrid(old),true,'selected saved grid still displays its original hexagons');assert.equal(ui.cellUsesDisplayedGrid(target),false,'a different grid cannot add overlapping fills');
  assert.deepEqual(db.prepare('SELECT * FROM avm_cache ORDER BY cache_key').all(),cacheBefore,'no cache keys, values, coordinates, provenance or timestamps changed');
  assert.ok(!queries.some(sql=>/^\s*(UPDATE|DELETE|DROP|ALTER)\b/i.test(sql)));assert.ok(!requests.some(path=>path.startsWith('/api/providers/')));assert.equal(providerCalls,0);assert.equal(credentialReads,0);
  if(process.env.RS_GRID_PREVIEW_FIXTURE)writeFileSync(process.env.RS_GRID_PREVIEW_FIXTURE,JSON.stringify({cells:known.cells,provider_calls:0,source:'OFFLINE SYNTHETIC GRID TEST'}));
  console.log('Passed fixed regional grid: route/gate/direction-independent cell identities, US/Hawaii/Alaska server geometry, single-count tessellation, exact old/new cache hits, saved-grid compatibility and reimport, forgery rejection, mixed-grid point rendering, and unchanged cache rows. Live provider calls and credential reads: 0.');
}finally{db.close();globalThis.fetch=originalFetch;}
