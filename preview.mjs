import http from 'node:http';
import {closeSync,mkdirSync,openSync,readFileSync,readdirSync,readSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from './dist/server/index.js';
mkdirSync('.sites-runtime',{recursive:true});
const sqlite=new DatabaseSync('.sites-runtime/preview-cache.sqlite');
sqlite.exec('CREATE TABLE IF NOT EXISTS preview_migrations (name TEXT PRIMARY KEY)');
for(const name of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())if(!sqlite.prepare('SELECT name FROM preview_migrations WHERE name = ?').get(name)){sqlite.exec(readFileSync('drizzle/'+name,'utf8'));sqlite.prepare('INSERT INTO preview_migrations (name) VALUES (?)').run(name);}
function prepare(sql){const stmt=sqlite.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return stmt.get(...this.args)??null;},all(){return{results:stmt.all(...this.args),success:true};},run(){stmt.run(...this.args);return{results:[],success:true};},execute(){if(stmt.columns().length)return{results:stmt.all(...this.args),success:true};stmt.run(...this.args);return{results:[],success:true};}};}
function readRentCastSecretFirstLine(path){const fd=openSync(path,'r'),bytes=[];try{const byte=Buffer.alloc(1);while(bytes.length<4096){if(readSync(fd,byte,0,1,null)===0||byte[0]===10)break;bytes.push(byte[0]);}if(bytes.length===4096)throw new Error('The local RentCast credential line exceeds the safe length limit.');const value=Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/,'').replace(/\r$/,'').trim();if(!value)throw new Error('The local RentCast credential source is empty.');return value;}finally{closeSync(fd);}}
const rentcastApiKey=process.env.RENTCAST_API_KEY?.trim()||readRentCastSecretFirstLine('C:\\Users\\ch250\\.secrets\\rentcast_api_key.txt');
const env={DB:{prepare,batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}},RENTCAST_API_KEY:rentcastApiKey};
const previewHosts=new Set(['127.0.0.1:8896','localhost:8896']);
const server=http.createServer(async(req,res)=>{try{
  if(!previewHosts.has(req.headers.host)){res.writeHead(403);res.end('Invalid preview host');return;}
  const origin='http://'+req.headers.host;
  if(req.method==='POST'&&req.headers.origin!==origin){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Same-origin request required.',provider_attempted:false}));return;}
  const parts=[];let size=0,requestLimit=req.url==='/road-mask'?8*1024*1024:5*1024*1024;for await(const chunk of req){size+=chunk.length;if(size>requestLimit){res.writeHead(413);res.end('Preview request too large');return;}parts.push(chunk);}const body=Buffer.concat(parts);
  // Keep the local preview on one origin without changing the published client or bridge allowlist.
  if(req.url==='/app.js'&&req.method==='GET'){
    const source=readFileSync('dist/client/app.js','utf8');
    const localSource=source.replace("const LOCAL_VALHALLA_BRIDGE='http://127.0.0.1:8003';","const LOCAL_VALHALLA_BRIDGE=globalThis.location.origin;");
    if(localSource===source)throw Error('Local preview transport could not be configured');
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(localSource);return;
  }
  if((req.url==='/status'&&req.method==='GET')||(['/route','/road-mask'].includes(req.url)&&req.method==='POST')){
    const upstream=await fetch('http://127.0.0.1:8003'+req.url,{method:req.method,headers:{'Content-Type':'application/json'},...(body.length?{body}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
    res.writeHead(upstream.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(Buffer.from(await upstream.arrayBuffer()));return;
  }
  const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
  const response=await worker.fetch(request,env);res.writeHead(response.status,{...Object.fromEntries(response.headers),'Cache-Control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));
}catch{res.writeHead(500);res.end('Preview unavailable');}});
server.listen(8896,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:8896'));
