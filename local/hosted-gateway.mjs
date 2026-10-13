import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {engineForPoints,validateRegionalEngines} from './engine-selection.mjs';

const MAX_BODY=2*1024*1024;
const MAX_RESPONSE=5*1024*1024;
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};

// Cloudflare connects to this loopback-only gateway, never the raw engine.
// The RS Worker holds the matching key; browsers and phones never receive it.
export function createHostedGateway({secret,fetchImpl=fetch,regions=[],readRegions=()=>regions}={}){
  if(typeof secret!=='string'||! /^[a-f0-9]{64}$/.test(secret))throw Error('Configure a 32-byte hexadecimal gateway key.');
  const expected=Buffer.from('Bearer '+secret);
  let activeRoutes=0;
  return http.createServer(async(req,res)=>{
    const authorization=Buffer.from(req.headers.authorization??'');
    if(authorization.length!==expected.length||!timingSafeEqual(authorization,expected)){req.resume();return send(res,401,{error:'RS authentication required.'});}
    let target,body,activeRegions;try{activeRegions=readRegions();}catch{req.resume();return send(res,503,{error:'Road coverage configuration is unavailable.'});}
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      target=new URL('http://127.0.0.1:8002');
      if(url.pathname==='/status'&&req.method==='GET'&&!url.search)target.pathname='/status';
      else if(url.pathname==='/route'&&req.method==='POST'&&!url.search){
        if(activeRoutes>=4){req.resume();return send(res,503,{error:'Desktop routing is busy. No automatic retry was made.'});}
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??'')){req.resume();return send(res,415,{error:'JSON route request required.'});}
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY){send(res,413,{error:'Route request exceeds the size limit.'});return;}chunks.push(chunk);}
        body=Buffer.concat(chunks);const payload=JSON.parse(body.toString('utf8'));
        if(payload?.costing!=='auto'||!Array.isArray(payload.locations)||payload.locations.length<2||payload.locations.length>22||!Number.isInteger(payload.alternates)||payload.alternates<0||payload.alternates>3)throw Error('Invalid reviewed car route.');
        target=new URL(engineForPoints(payload.locations,activeRegions));target.pathname='/route';
      }else if(url.pathname==='/locate'&&req.method==='POST'&&!url.search){
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??'')){req.resume();return send(res,415,{error:'JSON pin check required.'});}
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>50000)return send(res,413,{error:'Pin check exceeds the size limit.'});chunks.push(chunk);}
        const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(payload?.costing!=='auto'||payload.verbose!==true||!Array.isArray(payload.locations)||payload.locations.length!==2||payload.locations.some(p=>!Number.isFinite(p.lat)||Math.abs(p.lat)>90||!Number.isFinite(p.lon)||Math.abs(p.lon)>180||p.radius!==1600||p.search_cutoff!==1600))throw Error('Invalid pin check.');
        body=Buffer.from(JSON.stringify({locations:payload.locations.map(({lat,lon})=>({lat,lon,radius:1600,search_cutoff:1600})),costing:'auto',costing_options:payload.costing_options,verbose:true}));
        target=new URL(engineForPoints(payload.locations,activeRegions));target.pathname='/locate';
      }else if(url.pathname==='/tile'&&req.method==='GET'&&url.search.length<=1500){
        if([...url.searchParams.keys()].length!==1||!url.searchParams.has('json'))throw Error('Invalid road tile.');
        const tile=JSON.parse(url.searchParams.get('json')),coordinates=tile?.tile;
        if(coordinates?.z!==12||![coordinates.x,coordinates.y].every(value=>Number.isInteger(value)&&value>=0&&value<4096))throw Error('Invalid road tile coordinates.');
        const lon=(coordinates.x+0.5)/4096*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*(coordinates.y+0.5)/4096)))*180/Math.PI;
        target=new URL(engineForPoints([{lat,lon}],activeRegions));target.pathname='/tile';target.searchParams.set('json',JSON.stringify({tile:coordinates,filters:{attributes:['edge.road_class','edge.ramp','edge.toll'],action:'include'},generalize:1}));
      }else {req.resume();return send(res,404,{error:'Unsupported RS endpoint.'});}
    }catch{req.resume();return send(res,400,{error:'Invalid RS request.'});}
    const route=target.pathname==='/route';
    if(route&&activeRoutes>=4)return send(res,503,{error:'Desktop routing is busy. No automatic retry was made.'});
    if(route)activeRoutes++;
    try{
      if(target.pathname==='/status'&&activeRegions.length){
        const checks=await Promise.allSettled(activeRegions.map(async(region)=>{const check=await fetchImpl(region.base_url+'/status',{redirect:'error',signal:AbortSignal.timeout(3000)});if(!check.ok)throw Error('Regional engine unavailable.');}));
        if(checks.some(check=>check.status!=='fulfilled'))return send(res,503,{error:'The complete road engine is unavailable. Restart the desktop routing launcher.'});
      }
      const response=await fetchImpl(target,{method:req.method,headers:{Accept:target.pathname==='/tile'?'application/vnd.mapbox-vector-tile':'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body}:{}),redirect:'error',signal:AbortSignal.timeout(route?24000:10000)});
      const chunks=[];let size=0;
      if(response.body)for await(const chunk of response.body){size+=chunk.byteLength;if(size>MAX_RESPONSE)throw Error('Response too large.');chunks.push(Buffer.from(chunk));}
      res.writeHead(response.status,{'Content-Type':target.pathname==='/tile'?'application/vnd.mapbox-vector-tile':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.concat(chunks));
    }catch{send(res,502,{error:'Desktop Valhalla is unavailable or timed out. No automatic retry was made.'});}
    finally{if(route)activeRoutes--;}
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const secretFile=process.env.RS_VALHALLA_KEY_FILE;
  if(!secretFile)throw Error('Set RS_VALHALLA_KEY_FILE to the private gateway key file.');
  const regionPath=resolve(process.env.VALHALLA_REGION_ENGINES_PATH??resolve(import.meta.dirname,'../../../work/valhalla-local/regional-engines.json'));
  const readRegions=()=>existsSync(regionPath)?validateRegionalEngines(JSON.parse(readFileSync(regionPath,'utf8'))):[];
  const server=createHostedGateway({secret:readFileSync(secretFile,'utf8').trim(),readRegions});
  server.requestTimeout=30000;server.headersTimeout=10000;
  server.listen(8006,'127.0.0.1',()=>console.log('Protected RS desktop gateway listening on loopback port 8006.'));
}
