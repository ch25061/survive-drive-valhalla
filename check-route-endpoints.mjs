import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import worker from './dist/server/index.js';

const nodes=new Map(),order=[],listeners=new Map(),observers=[],maps=[];
function element(){return{children:[],style:{},value:'',hidden:false,textContent:'',append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(){},addEventListener(name,fn){listeners.set(this.id+'|'+name,fn);},before(item){order.push(['before',this.id,item.id]);},after(item){order.push(['after',this.id,item.id]);}};}
function create(){const node=element();Object.defineProperty(node,'id',{set(value){this._id=value;nodes.set(value,this);},get(){return this._id;}});return node;}
const get=id=>{if(!nodes.has(id)){const node=create();node.id=id;}return nodes.get(id);};
const layer=()=>({addTo(){return this;}});
const context={document:{getElementById:get,createElement:create},IntersectionObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}},ResizeObserver:class{observe(){}},setTimeout:resolve=>resolve(),AbortSignal,fetch:async()=>{throw Error('Unexpected external call');},L:{map(){const m={centers:[],setView(point,zoom){this.centers.push({point:Array.from(point),zoom});return this;},invalidateSize(){},removeLayer(){}};maps.push(m);return m;},tileLayer:layer,marker:layer,polyline:layer,divIcon:()=>({})}};context.window=context;vm.createContext(context);
vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),context);
const state=context.SurviveDrive.getState(),route={id:'test-1',name:'Test route',geometry:[[-88.1,42.1],[-88.1,42.11],[-88.05,41.96]],length_m:12000,duration_s:1000,route_directions:{source:'valhalla',steps:[{instruction:'Go south.',length_m:12000,duration_s:1000,leg_number:1}]}};
state.routes=[route];state.active=0;get('origin').value='42.100001,-88.100002';get('destination').value='41.960001,-88.050002';get('origin-name').value='Starting place';
vm.runInContext('renderRouteDirections()',context);
assert.deepEqual(order.filter(item=>item[1]==='route-directions-steps'),[['before','route-directions-steps','directions-origin'],['after','route-directions-steps','directions-destination']]);
assert.match(get('directions-origin-gps').textContent,/42.100001, -88.100002/);
assert.match(get('directions-destination-gps').textContent,/41.960001, -88.050002/);
vm.runInContext("for(const view of directionEndpointViews.values())renderDirectionEndpointMap(view)",context);
assert.deepEqual(maps.map(map=>map.centers[0].point),[[42.100001,-88.100002],[41.960001,-88.050002]],'each map centers on its own point, not the full route');
assert.ok(maps.every(map=>map.centers.every(center=>center.zoom===16)));
get('origin').value='30,-90';get('origin-name').value='Wrong trip';vm.runInContext('renderRouteDirections()',context);
assert.equal(get('directions-origin-name').textContent,'','a stale form label never attaches to another saved route');
assert.match(get('directions-origin-gps').textContent,/42.100000, -88.100000/);
context.fixture=[{key:'42.100000,-88.100000',source:'OpenStreetMap',address:'<script>literal address</script>'}];
vm.runInContext('restoreDirectionEndpointAddresses(fixture);renderRouteDirections()',context);
assert.match(get('directions-origin-address').textContent,/<script>literal address<\/script>/,'addresses are rendered safely as text');
assert.equal(get('directions-origin-address').innerHTML,undefined);
let calls=0,resolveLookup;context.fetch=()=>{calls++;return new Promise(resolve=>{resolveLookup=resolve;});};
vm.runInContext("directionEndpointAddresses.clear();queueDirectionEndpointAddress(directionEndpointViews.get('origin'));queueDirectionEndpointAddress(directionEndpointViews.get('origin'))",context);
await Promise.resolve();assert.equal(calls,1,'duplicate views do not repeat a lookup');
state.routes=[{...route,id:'other-1',geometry:[[-80,30],[-80.01,30.01]]}];vm.runInContext('renderRouteDirections()',context);
resolveLookup(Response.json({source:'OpenStreetMap',address:'Old address'}));await vm.runInContext('directionAddressQueue',context);
assert.doesNotMatch(get('directions-origin-address').textContent,/Old address/,'late results never replace a newly selected endpoint');
state.routes=[];vm.runInContext('renderRouteDirections()',context);assert.equal(get('route-directions').hidden,true);

const db=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const statement=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return statement.get(...this.args)??null;},run(){return statement.run(...this.args);}};}
const env={DB:{prepare}},origin='https://test.example',request=(point,headers={Origin:origin},override=env)=>worker.fetch(new Request(origin+'/api/locations/endpoint-address',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(point)}),override);
const originalFetch=globalThis.fetch;let requests=0,mode='valid',release;
globalThis.fetch=async(url,options)=>{requests++;const target=new URL(url);assert.equal(target.origin,'https://nominatim.openstreetmap.org');assert.equal(target.searchParams.get('format'),'jsonv2');assert.match(options.headers['User-Agent'],/RouteScrewtiny/);assert.equal(options.redirect,'error');if(mode==='pending')await new Promise(resolve=>{release=resolve;});if(mode==='failure')return new Response('{}',{status:503});return Response.json({display_name:'Test street, Test town',lat:target.searchParams.get('lat'),lon:target.searchParams.get('lon')});};
try{
  assert.equal((await request({latitude:100,longitude:0})).status,400);assert.equal((await request({latitude:42,longitude:-88},{})).status,403);assert.equal(requests,0);
  const result=await (await request({latitude:42,longitude:-88})).json();assert.equal(result.address,'Test street, Test town');assert.equal(result.approximate,true);
  const cached=await (await request({latitude:42,longitude:-88})).json();assert.equal(cached.cached,true);assert.equal(requests,1);
  assert.equal((await request({latitude:41,longitude:-87})).status,429);assert.equal(requests,1,'one shared rate gate applies across different points');
  db.exec('UPDATE endpoint_geocoder_rate SET last_started_ms=0');mode='pending';const pending=request({latitude:41,longitude:-87});
  for(let i=0;i<30&&!release;i++)await Promise.resolve();assert.ok(release);assert.equal((await request({latitude:40,longitude:-86})).status,429,'concurrent requests cannot bypass the atomic reservation');release();assert.equal((await pending).status,200);
  db.exec('UPDATE endpoint_geocoder_rate SET last_started_ms=0');mode='failure';const before=requests;assert.equal((await request({latitude:40,longitude:-86})).status,502);assert.equal(requests,before+1,'failed lookups make one attempt with no retry');
}finally{globalThis.fetch=originalFetch;db.close();}
console.log('Endpoint cards passed: placement, exact GPS, separate close-ups, stale labels/results, safe address text, lookup deduplication, same-origin validation, durable cache, global rate gate, concurrent calls and no retries. All external responses mocked.');
