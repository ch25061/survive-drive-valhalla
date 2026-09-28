import http from 'node:http';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from './dist/server/index.js';
mkdirSync('.sites-runtime',{recursive:true});
const sqlite=new DatabaseSync('.sites-runtime/preview-cache.sqlite');
sqlite.exec('CREATE TABLE IF NOT EXISTS preview_migrations (name TEXT PRIMARY KEY)');
for(const name of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())if(!sqlite.prepare('SELECT name FROM preview_migrations WHERE name = ?').get(name)){sqlite.exec(readFileSync('drizzle/'+name,'utf8'));sqlite.prepare('INSERT INTO preview_migrations (name) VALUES (?)').run(name);}
function prepare(sql){const stmt=sqlite.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return stmt.get(...this.args)??null;},execute(){if(stmt.columns().length)return{results:stmt.all(...this.args),success:true};stmt.run(...this.args);return{results:[],success:true};}};}
const env={DB:{prepare,batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
const server=http.createServer(async(req,res)=>{try{const parts=[];for await(const chunk of req)parts.push(chunk);const body=Buffer.concat(parts);const request=new Request('http://127.0.0.1:8896'+req.url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Preview unavailable');}});
server.listen(8896,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:8896'));
