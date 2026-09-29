import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync('dist/index.html','utf8');
const app=readFileSync('dist/app.js','utf8');
assert.match(html,/<details id="pool-screening-plan-details"[\s\S]*?<details id="pool-screening-route-allocation-details"><summary>Per-route quota details<\/summary><div id="pool-screening-rationale"><\/div><\/details>/,
  'verbose per-route allocation rows should be inside a collapsed disclosure');
assert.match(html,/<details id="pool-screening-ledger-details"><summary>Execution ledger<\/summary>/,
  'execution ledger should remain available as an audit disclosure');
assert.match(html,/<details><summary>Exact plan data<\/summary><pre id="pool-screening-plan"><\/pre><\/details>/,
  'exact plan data should remain available for review and audit');
assert.match(app,/Planned: '\+screen\.plan\.cells\.length\+' new RentCast API pull/,
  'visible plan summary should lead with the concise API pull count');
assert.match(app,/Manual follow-up rounds wait for your Run click; the initial screen can start automatically after a short pause\. No more than /,
  'the exact-list Manual launch boundary must remain explicit');
assert.match(app,/purpose:'candidate_pool_quota'/,
  'pool screening must retain the exact route-quota authorization path');
console.log('Passed pool plan display contract: concise pull count, collapsed per-route details, and preserved exact-plan audit and authorization disclosures.');
