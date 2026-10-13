import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const encoded='BGwynmkDu39wZvBtF3InfvHrdvHvboGzF0FnGoGvHsOvR8L3NkSvWoGvHsEzFgFvHkD3IwHrJwHrJgKjN4D_E0ezoBjInV3N_iBzJ_Z';
const candidate={sections:[{polyline:encoded,summary:{length:1000,duration:60},spans:[{offset:0,streetAttributes:[]}]}]};
const catalog={schema:'survive_drive_intersection_catalog_v1',version:'ui-test-v1',source:'fixture',coverage:{center:[41.9,-87.7],radius_m:12000,exhaustive:true},intersections:[
  {id:'n',name:'North gate',latitude:41.929,longitude:-87.7,major_rank:1,connected_roads:4},
  {id:'e',name:'East gate',latitude:41.9,longitude:-87.661,major_rank:1,connected_roads:4},
  {id:'s',name:'South gate',latitude:41.871,longitude:-87.7,major_rank:1,connected_roads:4},
  {id:'w',name:'West gate',latitude:41.9,longitude:-87.739,major_rank:1,connected_roads:4}
]};

const destinationCatalog={...catalog,version:'ui-destination-v1',coverage:{center:[42,-87.6],radius_m:12000,exhaustive:true},intersections:catalog.intersections.map(g=>({...g,latitude:g.latitude+.1,longitude:g.longitude+.1}))};
function radialRoadQueryGeometry(origin,radiusM){const latitude=origin[0],longitude=origin[1],xScale=111320*Math.max(.1,Math.cos(latitude*Math.PI/180)),paths=[];for(let index=0;index<32;index++){const angle=index*2*Math.PI/32,x=Math.sin(angle)*radiusM,y=Math.cos(angle)*radiusM;paths.push([[longitude,latitude],[Number((longitude+x/xScale).toFixed(6)),Number((latitude+y/111320).toFixed(6))]]);}return JSON.stringify({paths,spatialReference:{wkid:4326}});}

function harness(mode='success',acceptLimited=true){
  const elements=new Map(),calls=[],censusCalls=[];let active=0,maxActive=0,gateCalls=0;const claimedPages=new Set();
  function element(){return{getBoundingClientRect(){return this.rect??{top:0,bottom:50,left:0,right:100,width:100,height:50};},value:'',checked:false,type:'',className:'',children:[],textContent:'',listeners:{},disabled:false,hidden:false,style:{},scrolls:[],classList:{add(){},remove(){},toggle(){}},replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},before(){},after(){},setAttribute(){},removeAttribute(){},addEventListener(k,fn){this.listeners[k]=fn;},focus(){},click(){},scrollIntoView(options){this.scrolls.push(options);}};}
  const get=id=>{if(!elements.has(id)){const e=element();e.id=id;elements.set(id,e);}return elements.get(id);};
  for(const [id,value]of Object.entries({'origin':'41.9,-87.7','destination':'42,-87.6','origin-name':'Start','destination-name':'End','departure-mode':'any','routing-mode':'fast','candidate-limit':'3','here-key':'','avm-cap':'0','shotgun-inner':'1.5','shotgun-outer':'3','shotgun-spacing':'0.75','shotgun-count':'4'}))get(id).value=value;
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  const pageId='tiger-v10-binned-local-mock-destination',pageOrigin=[42,-87.6],pageOuterMiles=3,pageRadius=Math.ceil(pageOuterMiles*1609.344);
  const censusUrl=new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/7/query');
  for(const [name,value]of Object.entries({where:'1=1',geometry:radialRoadQueryGeometry(pageOrigin,pageRadius),geometryType:'esriGeometryPolyline',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'BASENAME,NAME',returnGeometry:'true',outSR:'4326',geometryPrecision:'6',resultRecordCount:'2000',f:'json'}))censusUrl.searchParams.set(name,value);
  const pageGates=[{id:'n',name:'North gate',latitude:42.03,longitude:-87.6,major_rank:1,connected_roads:4},{id:'e',name:'East gate',latitude:42,longitude:-87.56,major_rank:1,connected_roads:4},{id:'s',name:'South gate',latitude:41.97,longitude:-87.6,major_rank:1,connected_roads:4},{id:'w',name:'West gate',latitude:42,longitude:-87.64,major_rank:1,connected_roads:4}];
  const censusPayload={type:'FeatureCollection',features:pageGates.flatMap((gate,index)=>{const p=[gate.longitude,gate.latitude],d=.0006;return[{type:'Feature',properties:{NAME:'North Road '+index},geometry:{type:'LineString',coordinates:[[p[0],p[1]-d],p,[p[0],p[1]+d]]}},{type:'Feature',properties:{NAME:'Cross Road '+index},geometry:{type:'LineString',coordinates:[[p[0]-d,p[1]],p,[p[0]+d,p[1]]]}}];})};
  const fetchedCatalog={...destinationCatalog,version:'ui-destination-census-v5',intersections:pageGates};
  const ui={crypto:webcrypto,setTimeout,clearTimeout,TextEncoder,TextDecoder,URL,AbortSignal,structuredClone,document:{getElementById:get,querySelectorAll:()=>[],querySelector:selector=>get(selector==='#shotgun-settings > summary'?'shotgun-settings-summary':selector.replace(/^#/,'').split(/[ >]/)[0]),createElement:element,createElementNS:element},async fetch(path,options={}){
    const requestUrl=new URL(typeof path==='string'?path:path.url,'https://survivedrive.test');
    if(requestUrl.origin==='https://tigerweb.geo.census.gov'){
      censusCalls.push({url:requestUrl.href,options});return json(censusPayload);
    }
    calls.push({path:requestUrl.pathname,options});
    if(requestUrl.pathname==='/api/providers/status')return json({here_server_key:true,rentcast_server_key:true});
    if(requestUrl.pathname==='/api/cache/reference')return json({provider_calls:0,entries:[]});
    if(requestUrl.pathname==='/api/cache/lookup'){const body=JSON.parse(options.body);return json({provider_calls:0,entries:body.cells.map(cell=>({cell_id:cell.cell_id,status:'miss'}))});}
    if(requestUrl.pathname==='/api/honeycomb/lookup'){const body=JSON.parse(options.body);return json({provider_calls:0,entries:body.cells.map(cell=>({cell_id:cell.cell_id,status:'constructed'}))});}
    if(requestUrl.pathname==='/api/intersections/lookup')return json({source_attempted:false,source_calls:0,here_calls:0,rentcast_calls:0,status:'missing',page_id:pageId,attempts_used:claimedPages.has(pageId)?1:0,retry_available:claimedPages.has(pageId)});
    if(requestUrl.pathname==='/api/intersections/construct'){
      const body=JSON.parse(options.body);assert.deepEqual(body,{origin:pageOrigin,outer_miles:pageOuterMiles});
      if(claimedPages.has(pageId))return json({error:'This area was attempted before. Choose Retry Census lookup to approve one new request.',page_id:pageId,source_attempted:false,source_calls:0,here_calls:0,rentcast_calls:0,retry_available:true},409);
      claimedPages.add(pageId);return json({page_id:pageId,claim_id:pageId,attempt_number:1,retry_available:true,origin:pageOrigin,outer_miles:pageOuterMiles,radius_m:pageRadius,census_request:{url:censusUrl.href,method:'GET',headers:{Accept:'application/json'},maximum_response_bytes:5*1024*1024},source_attempted:false,source_calls:0,here_calls:0,rentcast_calls:0,credential_access:false});
    }
    if(requestUrl.pathname==='/api/intersections/ingest'){
      const body=JSON.parse(options.body);assert.equal(body.page_id,pageId);assert.equal(body.claim_id,pageId);assert.deepEqual(body.origin,pageOrigin);assert.equal(body.outer_miles,pageOuterMiles);assert.deepEqual(body.census_payload,censusPayload);
      return json({page_id:pageId,catalog:fetchedCatalog,source_attempted:true,source_calls:1,here_calls:0,rentcast_calls:0,credential_access:false});
    }
    if(path==='/api/providers/here'){
      gateCalls++;active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;
      if((mode==='unknown-first'&&gateCalls===1)||(mode==='unknown-second'&&gateCalls===2))return new Response('<!DOCTYPE html><html>Sign in</html>',{status:200,headers:{'content-type':'text/html'}});
      if(mode==='spent-first'&&gateCalls===1)return json({error:'Provider failed',provider_attempted:true},502);
      return json({provider_attempted:true,received_at:'2026-09-19T12:00:00Z',response:{routes:mode==='zero-routes'?[]:[candidate]}});
    }
    throw Error('Unexpected request '+path);
  }};
  ui.window=ui;vm.createContext(ui);for(const file of ['here-decoder.js','h3-pinned.js','route-avm.js','shotgun-gates.js','pool-screening.js','red-exclusion-zones.js','app.js'])vm.runInContext(readFileSync('dist/'+file,'utf8').replace(/\ninit\(\);\s*$/,''),ui);
   const app=ui.SurviveDrive,state=app.getState();state.providerStatus={here_server_key:true,rentcast_server_key:true};state.routes=JSON.parse(readFileSync('dist/reference.json','utf8')).routes;get('red-cutoff').value='250';assert.equal(app.confirmRedThreshold(250),true);state.intersectionCatalog=state.intersectionCatalogs.start=ui.SurviveShotgun.validateCatalog(catalog);state.intersectionCatalogs.destination=ui.SurviveShotgun.validateCatalog(destinationCatalog);app.suggestShotgunGates();state.shotgunSuggestions.gates[1].selected=false;app.renderShotgunGates();const destination=app.suggestShotgunGates({side:'destination'});destination.gates[1].selected=false;destination.gates[2].selected=false;destination.gates[3].selected=false;app.renderShotgunGates('destination');if(acceptLimited){assert.equal(app.acceptLimitedShotgunGates('start'),true);assert.equal(app.acceptLimitedShotgunGates('destination'),true);}
  return{ui,app,state,get,calls,censusCalls,stats:()=>({gateCalls,maxActive})};
}

// Each trip end independently remains in the adjustment loop until the full
// requested count is selected or the user explicitly accepts that limited set.
{
  const h=harness('success',false);h.get('shotgun-settings').open=true;assert.equal(h.app.gateResolutionReady('start'),false);assert.equal(h.app.gateResolutionReady('destination'),false);assert.equal(h.get('prepare-shotgun-batch').disabled,true);assert.throws(()=>h.app.prepareDraft(),/explicitly accept the selected limited Start set/);let next=h.app.updateNextAction();assert.equal(next.target.id,'accept-limited-shotgun');h.ui.innerHeight=800;h.ui.innerWidth=1200;const destinationGroup=h.get('shotgun-resolution-destination'),destinationApproval=h.get('accept-limited-shotgun-destination');destinationGroup.rect={top:930,bottom:1280,left:16,right:360,width:344,height:350};destinationApproval.rect={top:1190,bottom:1250,left:30,right:345,width:315,height:60};destinationGroup.scrollIntoView=options=>{destinationGroup.scrolls.push(options);destinationGroup.rect={top:220,bottom:570,left:16,right:360,width:344,height:350};destinationApproval.rect={top:480,bottom:540,left:30,right:345,width:315,height:60};};assert.equal(h.app.acceptLimitedShotgunGates('start'),true);assert.equal(h.app.gateResolutionReady('start'),true);next=h.app.updateNextAction();assert.equal(next.target.id,'accept-limited-shotgun-destination');assert.ok(destinationGroup.scrolls.length>0,'the Destination limited-set decision scrolls its approval panel into view');assert.equal(destinationApproval.scrolls.length,0,'a fitting decision panel is kept together with its large Accept button');assert.equal(h.app.acceptLimitedShotgunGates('destination'),true);assert.equal(h.app.gateResolutionReady('destination'),true);assert.equal(h.get('prepare-shotgun-batch').disabled,false);const draft=h.app.prepareDraft();assert.equal(draft.shotgun.gate_resolution.start.limited_set_accepted,true);assert.equal(draft.shotgun.gate_resolution.destination.limited_set_accepted,true);const firstStart=h.get('shotgun-gate-list').children[0].children[0];firstStart.checked=false;firstStart.listeners.change();assert.equal(h.app.gateResolutionReady('start'),false);assert.equal(h.get('prepare-shotgun-batch').disabled,true);assert.throws(()=>h.app.prepareDraft(),/explicitly accept the selected limited Start set/);assert.equal(h.calls.length,0);
}

console.log('Passed limited Destination approval focus and zero route calls.');
