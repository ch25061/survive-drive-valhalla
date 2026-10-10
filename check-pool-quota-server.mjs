import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from './dist/server/index.js';

const db=new DatabaseSync(':memory:');
for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const statement=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return statement.get(...this.args)??null;},all(){return{results:statement.all(...this.args)};},execute(){if(statement.columns().length)return{results:statement.all(...this.args)};statement.run(...this.args);return{results:[]};}};}
const env={DB:{prepare,batch(statements){return statements.map(statement=>statement.execute());}},RENTCAST_API_KEY:'offline-test-key'};
const origin='https://pool-quota.test';
const call=async(path,body)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
const cells=globalThis.h3.gridDisk(globalThis.h3.latLngToCell(41.91,-87.67,8),6).slice(0,110).map(index=>globalThis.SurviveAvm.cellFromId('H3R8-V1-'+index));
assert.equal((await call('/api/honeycomb/construct',{grid_version:'H3R8-V1',cells:cells.map(({cell_id,q,r})=>({cell_id,q,r}))})).status,200);
const approval={approved:true,plan_id:'pool-quota-over-100',purpose:'candidate_pool_quota',subject_profile:'rentcast-value-v1|Single Family|3bed|2bath|1500sqft|lookup=false',maximum_attempts:110,cells:cells.map(({cell_id,latitude,longitude})=>({cell_id,latitude,longitude}))};
const response=await call('/api/providers/avm/approve',approval);
assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
assert.equal((await response.json()).maximum_attempts,110,'the server accepts the exact 110-cell first-round plan');
assert.equal((await call('/api/providers/avm/approve',{...approval,plan_id:'pool-quota-underdeclared',maximum_attempts:109})).status,400,'the server rejects a ceiling below the exact cell list');
console.log('Server quota authorization above 100 unique cells passed without a provider request.');
