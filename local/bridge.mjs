import {createServer} from 'node:http';
import {appendFileSync,existsSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {engineForPoints,validateRegionalEngines} from './engine-selection.mjs';
import {valhallaPayload,valhallaHighwayCellMasks,validateValhallaResponse,endpointCheckPayload,endpointCheckResult} from '../server/valhalla-provider.js';

const listenHost='127.0.0.1';
const listenPort=8003;
const engine='http://127.0.0.1:8002';
const claimsPath=resolve(process.env.VALHALLA_CLAIMS_PATH??'./local-round-claims.jsonl');
const regionPath=resolve(process.env.VALHALLA_REGION_ENGINES_PATH??dirname(claimsPath)+'/regional-engines.json');
const readRegions=()=>existsSync(regionPath)?validateRegionalEngines(JSON.parse(readFileSync(regionPath,'utf8'))):[];
const origins=new Set([
  'https://survive-drive-valhalla.choppy777.chatgpt.site',
  'https://valhalla.choppy.fans',
  'http://127.0.0.1:8003',
]);
const pageFiles=new Map([
  ['/', ['planner.html','text/html; charset=utf-8']],
  ['/planner.js', ['planner.js','text/javascript; charset=utf-8']],
  ['/planner.css', ['planner.css','text/css; charset=utf-8']],
  ['/valhalla-decoder.js', ['../dist/valhalla-decoder.js','text/javascript; charset=utf-8']],
]);
mkdirSync(dirname(claimsPath),{recursive:true});
const spent=new Set();
if(existsSync(claimsPath))for(const line of readFileSync(claimsPath,'utf8').split(/\r?\n/)){
  if(!line.trim())continue;
  const claim=JSON.parse(line);
  if(typeof claim.round_id==='string')spent.add(claim.round_id);
}

function send(response,status,body,origin){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Private-Network':'true','Vary':'Origin'};
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  response.writeHead(status,headers);
  response.end(JSON.stringify(body));
}
function validate(input){
  if(!input||input.approved!==true||typeof input.round_id!=='string'||!(/^[A-Za-z0-9_-]{1,100}$/).test(input.round_id))throw Error('Review and approve one identified route request.');
  const p=input.params;
  if(!p||p.transportMode!=='car'||!['fast','short'].includes(p.routingMode)||p.departureTime!=='any'||!Number.isInteger(p.alternatives)||p.alternatives<0||p.alternatives>3||!Array.isArray(p.via??[])||(p.via??[]).length>20)throw Error('Invalid Valhalla route settings.');
  if((p.via??[]).length&&p.alternatives!==0)throw Error('Gate routes cannot request alternatives.');
  return valhallaPayload(p);
}
async function readJson(request,limit=2*1024*1024){
  let text='';
  for await(const chunk of request){text+=chunk;if(text.length>limit)throw Error('Route request is too large.');}
  return JSON.parse(text);
}
async function boundedJson(response){
  const reader=response.body.getReader(),decoder=new TextDecoder();let total=0,text='';
  while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>5*1024*1024){await reader.cancel();throw Error('Valhalla response exceeded 5 MiB.');}text+=decoder.decode(part.value,{stream:true});}
  text+=decoder.decode();
  let data;
  try{data=JSON.parse(text);}catch{if(!response.ok)throw Object.assign(Error('Valhalla returned HTTP '+response.status+' with a non-JSON error response.'),{status:response.status});throw Error('Valhalla returned an invalid JSON response.');}
  if(!response.ok){const detail=typeof data?.error==='string'?data.error:typeof data?.status==='string'?data.status:'';throw Object.assign(Error('Valhalla returned HTTP '+response.status+(detail?': '+detail:'')),{status:response.status});}
  return data;
}

const server=createServer(async(request,response)=>{
  if(request.headers.host!=='127.0.0.1:8003'){send(response,403,{error:'Use the local address 127.0.0.1.'});return;}
  const origin=request.headers.origin;let regions;try{regions=readRegions();}catch{send(response,503,{error:'Road coverage configuration is unavailable.',provider_attempted:false},origin);return;}const mapArea=regions.some(r=>r.name==='United States')?'Complete U.S. OpenStreetMap road graph':regions.length?'U.S. cities over 100,000 population with 20-mile buffers, plus full Florida':'Configured desktop road graph';
  if(origin&&!origins.has(origin)){send(response,403,{error:'Origin is not allowed.'});return;}
  if(request.method==='OPTIONS'){
    response.writeHead(204,{'Access-Control-Allow-Origin':origin??'null','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Private-Network':'true','Vary':'Origin'});
    response.end();return;
  }
  if(request.method==='GET'&&pageFiles.has(request.url)){
    const [file,contentType]=pageFiles.get(request.url);
    try{response.writeHead(200,{'Content-Type':contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(readFileSync(resolve(import.meta.dirname,file)));}catch{send(response,500,{error:'Local page is unavailable.'},origin);}return;
  }
  if(request.url==='/status'&&request.method==='GET'){
    const checks=await Promise.allSettled([engine,...regions.map(region=>region.base_url)].map(async(base)=>{const check=await fetch(base+'/status',{signal:AbortSignal.timeout(3000),redirect:'error'});return check.ok;}));
    send(response,200,{valhalla_ready:checks.every(check=>check.status==='fulfilled'&&check.value),mode:'local',map_area:mapArea},origin);return;
  }
  if(request.url==='/check-endpoints'&&request.method==='POST'){
    let payload;
    try{payload=endpointCheckPayload(await readJson(request,50000));}catch(error){send(response,400,{error:error.message,route_requests:0,avm_calls:0},origin);return;}
    try{const upstream=await fetch(engineForPoints(payload.locations,regions,engine)+'/locate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(10000)});send(response,200,endpointCheckResult(await boundedJson(upstream),payload),origin);}
    catch{send(response,502,{error:'The driving-road check could not finish. Check the desktop Valhalla connection, then try again. No route request was sent.',route_requests:0,avm_calls:0},origin);}return;
  }
  if(request.url==='/road-mask'&&request.method==='POST'){
    try{const input=await readJson(request,8*1024*1024),options=input?.route_options;if(!options||![0,0.5,1].includes(options.highways)||![0,0.5,1].includes(options.tolls))throw Error('Choose valid highway and toll preferences.');const includeHighways=options.highways===1,includeTollways=options.tolls===1;if(!includeHighways&&!includeTollways){send(response,200,{highway_cell_ids:[],tollway_cell_ids:[],tile_count:0,road_source:'Valhalla static graph tiles'},origin);return;}const masks=await valhallaHighwayCellMasks({cells:input.cells,include_tollways:includeTollways},engineForPoints((input.cells??[]).flatMap(cell=>(cell.polygon??[]).map(([lon,lat])=>({lat,lon}))),regions,engine));send(response,200,{...masks,highway_cell_ids:includeHighways?masks.highway_cell_ids:[],tollway_cell_ids:includeTollways?masks.tollway_cell_ids:[]},origin);}catch(error){send(response,502,{error:error.message||'The Valhalla static road mask could not be built. No route request was sent.'},origin);}return;
  }
  if(request.url!=='/route'||request.method!=='POST'){send(response,404,{error:'Not found.'},origin);return;}
  let input,payload;
  try{input=await readJson(request);payload=validate(input);}catch(error){send(response,400,{error:error.message,provider_attempted:false},origin);return;}
  if(spent.has(input.round_id)){send(response,409,{error:'This route request was already submitted. Prepare a new batch.',provider_attempted:false},origin);return;}
  try{appendFileSync(claimsPath,JSON.stringify({round_id:input.round_id,at:new Date().toISOString()})+'\n',{encoding:'utf8',flag:'a'});spent.add(input.round_id);}catch{send(response,503,{error:'Could not reserve the one-time route request.',provider_attempted:false},origin);return;}
  try{
    const upstream=await fetch(engineForPoints(payload.locations,regions,engine)+'/route',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(25000)});
    const data=validateValhallaResponse(await boundedJson(upstream),payload.alternates+1,input.params);
    send(response,200,{round_id:input.round_id,provider_attempted:true,response:data,received_at:new Date().toISOString(),provider:'Valhalla'},origin);
  }catch(error){send(response,Number.isInteger(error.status)?error.status:502,{error:error.message+' This attempt counts; no retry was made.',provider_attempted:true},origin);}
});
server.listen(listenPort,listenHost,()=>console.log('Local Valhalla bridge ready at http://'+listenHost+':'+listenPort));
