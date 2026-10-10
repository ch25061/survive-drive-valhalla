// Registry and cache conflict regression for the permanently anchored global grid.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import * as h3 from 'h3-js';
import vm from 'node:vm';
import worker from './dist/server/index.js';
const context={h3};vm.createContext(context);vm.runInContext(readFileSync('dist/route-avm.js','utf8'),context);const avm=context.SurviveAvm;
const db=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const stmt=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return stmt.get(...this.args)??null;},all(){return{results:stmt.all(...this.args)};},execute(){if(stmt.columns().length)return this.all();stmt.run(...this.args);return{results:[]};}};}
let providerCalls=0,credentials=0;const original=globalThis.fetch;globalThis.fetch=()=>{providerCalls++;throw Error('Provider requests forbidden');};
const env={DB:{prepare,batch:items=>items.map(s=>s.execute())},get RENTCAST_API_KEY(){credentials++;throw Error('Credentials forbidden');}},subject='rentcast-value-v1|Single Family|3bed|2bath|1500sqft|lookup=false',schema='survive_drive_avm_cache_h3r8_v1';
const api=(path,body)=>worker.fetch(new Request('https://offline.test'+path,{method:'POST',headers:{Origin:'https://offline.test','Content-Type':'application/json'},body:JSON.stringify(body)}),env);
try{
 const cell=avm.cellAt(26.43,-81.8),body={grid_version:cell.grid_version,cells:[cell]};assert.equal((await api('/api/honeycomb/construct',body)).status,200);const row=db.prepare('SELECT * FROM honeycomb_cells WHERE cell_id=?').get(cell.cell_id);
 for(const field of ['latitude','longitude','polygon_json']){const bad=field==='polygon_json'?'[]':row[field]+.00000001;db.prepare('UPDATE honeycomb_cells SET '+field+'=? WHERE cell_id=?').run(bad,cell.cell_id);assert.equal((await api('/api/honeycomb/construct',body)).status,409);assert.equal(db.prepare('SELECT '+field+' FROM honeycomb_cells WHERE cell_id=?').get(cell.cell_id)[field],bad,'conflict is never repaired silently');db.prepare('UPDATE honeycomb_cells SET '+field+'=? WHERE cell_id=?').run(row[field],cell.cell_id);}
 const key=JSON.stringify([schema,'RentCast',cell.cell_id,subject]);db.prepare('INSERT INTO avm_cache VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(key,cell.cell_id,cell.latitude+.00000001,cell.longitude,subject,'RentCast',321,'synthetic_offline','no_provider','2026-10-10','2026-10-10',schema);
 assert.equal((await api('/api/cache/lookup',{subject_profile:subject,cells:[cell]})).status,409);assert.equal((await api('/api/cache/lookup',{subject_profile:subject,cells:[{...cell,latitude:cell.latitude+.00000001}]})).status,400);assert.equal((await(await api('/api/cache/known-cells',{})).json()).cells.length,0);
 assert.equal(db.prepare('SELECT latitude FROM avm_cache WHERE cache_key=?').get(key).latitude,cell.latitude+.00000001);assert.equal(providerCalls,0);assert.equal(credentials,0);console.log('Passed permanent-grid conflicts: moved registry GPS, altered polygon, moved cache center and forged query all stop before provider calls; conflicting records are not rewritten. Provider calls: 0.');
}finally{db.close();globalThis.fetch=original;}
