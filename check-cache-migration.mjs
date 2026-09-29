import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from './dist/server/index.js';

const db=new DatabaseSync(':memory:');
for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const statement=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return statement.get(...this.args)??null;},all(){return{results:statement.all(...this.args)};},execute(){if(statement.columns().length)return{results:statement.all(...this.args)};statement.run(...this.args);return{results:[]};}};}
const env={DB:{prepare,batch(statements){return statements.map(statement=>statement.execute());}},CACHE_IMPORT_TOKEN:'a'.repeat(48)};
const origin='https://migration.test',subject='rentcast-value-v1|Single Family|3bed|2bath|1500sqft|lookup=false',schema='survive_drive_avm_cache_v1';
function row(estimate=321){const cell_id='CHI1K-V1-Q+0-R+0',latitude=41.91063814,longitude=-87.66769738;return{cache_key:JSON.stringify([schema,'RentCast',cell_id,latitude,longitude,subject]),cell_id,latitude,longitude,subject_profile:subject,provider:'RentCast',estimate_ppsqft:estimate,source_kind:'live_rentcast',source_artifact:'legacy-test',acquired_at:'2026-09-20T00:00:00.000Z',cached_at:'2026-09-20T00:00:00.000Z',schema_version:schema};}
async function post(rows,token=env.CACHE_IMPORT_TOKEN){const response=await worker.fetch(new Request(origin+'/api/cache/import-legacy',{method:'POST',headers:{'Content-Type':'application/json','X-Cache-Import-Key':token},body:JSON.stringify({schema,rows})}),env);return{status:response.status,body:await response.json()};}
assert.equal((await post([row()],'wrong')).status,403);
assert.deepEqual(await post([row()]),{status:200,body:{received:1,inserted:1,provider_calls:0}});
assert.deepEqual(await post([row(999)]),{status:200,body:{received:1,inserted:0,provider_calls:0}},'existing cache entry must be preserved');
assert.equal(db.prepare('SELECT estimate_ppsqft FROM avm_cache').get().estimate_ppsqft,321);
assert.equal((await post([{...row(),latitude:41.92}])).status,400);
assert.equal((await post([{...row(),subject_profile:'other'}])).status,400);
assert.equal((await post([row(),row()])).status,400);
assert.equal(db.prepare('SELECT COUNT(*) AS total FROM avm_cache').get().total,1);
db.close();
console.log('Authenticated migration, canonical keys, duplicate handling, and no-overwrite behavior passed offline.');
