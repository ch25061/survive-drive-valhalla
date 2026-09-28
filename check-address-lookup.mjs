import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from './dist/server/index.js';

const origin='https://test.example',env={HERE_API_KEY:'test-here-key'};
const post=(query,headers={Origin:origin},environment=env)=>worker.fetch(new Request(origin+'/api/locations/geocode',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({query})}),environment);
const originalFetch=globalThis.fetch;
let sent=0,mode='ok';
globalThis.fetch=async(url,options)=>{
  sent++;const target=new URL(url);
  assert.equal(target.origin,'https://geocode.search.hereapi.com');
  assert.equal(target.pathname,'/v1/geocode');
  assert.equal(target.searchParams.get('in'),'countryCode:USA');
  assert.equal(target.searchParams.get('limit'),'5');
  assert.equal(target.searchParams.get('apiKey'),'test-here-key');
  assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');
  if(mode==='http')return new Response('{}',{status:503});
  return Response.json({items:[{resultType:'houseNumber',address:{label:'305 Mansfield Ct, Bartlett, IL 60103, United States'},position:{lat:41.9,lng:-88.2},access:[{lat:41.91,lng:-88.21}]},{resultType:'street',address:{label:'Mansfield Ct, Bartlett, IL'},position:{lat:41.92,lng:-88.22}}]});
};
try{
  assert.equal((await post('305 Mansfield Ct',{})).status,403);
  assert.equal((await post('x')).status,400);
  assert.equal((await post('305 Mansfield Ct',{Origin:origin},{})).status,428);
  assert.equal(sent,0);
  const response=await post('305 Mansfield Ct');assert.equal(response.status,200);
  const result=await response.json();assert.equal(sent,1);assert.equal(result.provider_calls,1);
  assert.equal(result.matches[0].latitude,41.91);assert.equal(result.matches[0].longitude,-88.21);
  assert.equal(result.matches[1].latitude,41.92);
  assert.equal(JSON.stringify(result).includes('test-here-key'),false);
  mode='http';const failed=await post('305 Mansfield Ct');assert.equal(failed.status,502);assert.equal((await failed.json()).provider_calls,1);assert.equal(sent,2);
}finally{globalThis.fetch=originalFetch;}

const elements=new Map();
const makeElement=()=>({value:'',textContent:'',disabled:false,hidden:false,children:[],listeners:{},classList:{add(){},remove(){},toggle(){}},addEventListener(type,listener){this.listeners[type]=listener;},replaceChildren(...children){this.children=children;},append(child){this.children.push(child);},setAttribute(){},scrollIntoView(){}});
const get=id=>{if(id==='next-action'||id==='next-action-text')return null;if(!elements.has(id))elements.set(id,makeElement());return elements.get(id);};
let browserCalls=0;
const ui={document:{getElementById:get,createElement:makeElement,addEventListener(){}},fetch:async(path,options)=>{browserCalls++;assert.equal(path,'/api/locations/geocode');const query=JSON.parse(options.body).query;if(query==='305 Mansfield Ct, Bartlett, IL')return Response.json({matches:[{label:'305 Mansfield Ct, Bartlett, IL 60103, United States',latitude:41.91,longitude:-88.21},{label:'Mansfield Ct, Bartlett, IL',latitude:41.92,longitude:-88.22}],provider_calls:1});assert.equal(query,'200 Main St, Bartlett, IL');return Response.json({matches:[{label:'200 Main St, Bartlett, IL',latitude:41.97,longitude:-88.19}],provider_calls:1});}};
ui.window=ui;vm.createContext(ui);
vm.runInContext(readFileSync('dist/app.js','utf8').replace(/\ninit\(\);\s*$/,''),ui);
const app=ui.SurviveDrive,state=app.getState();state.providerStatus.here_server_key=true;
get('origin-address').value='305 Mansfield Ct, Bartlett, IL';
assert.equal(browserCalls,0);
await app.findAddress('origin');
assert.equal(browserCalls,1);assert.equal(get('origin-address-results').children.length,2);
assert.equal(get('origin').value,'41.91,-88.21');
assert.equal(get('destination').value,'');
assert.equal(get('origin-name').value,'305 Mansfield Ct, Bartlett, IL 60103, United States');
assert.equal(get('origin-address-results').children[0].disabled,true);
get('origin-address-results').children[1].listeners.click();assert.equal(get('origin').value,'41.92,-88.22');
get('destination-address').value='200 Main St, Bartlett, IL';await app.findAddress('destination');
assert.equal(get('destination').value,'41.97,-88.19');assert.equal(get('destination-name').value,'200 Main St, Bartlett, IL');
assert.equal(state.providerCalls.Geocode,2);assert.equal(state.providerCalls.HERE,0);
app.bindTripPointControls();get('origin-address').value='Different address';get('origin-address').listeners.input();
assert.equal(get('origin').value,'');
get('origin').value='41.91,-88.21';get('origin-name').value='Custom label';get('origin-name').listeners.input();assert.equal(get('origin').value,'41.91,-88.21');
console.log('Passed address lookup: one explicit HERE call, same-origin/key/validation guards, sanitized street-access coordinates, no retry, automatic Start/Destination placement, optional match correction, and stale-coordinate clearing.');
