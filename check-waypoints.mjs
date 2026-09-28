import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('dist/index.html','utf8');
const appSource=readFileSync('dist/app.js','utf8');
const app={document:{getElementById(){return{value:'250',addEventListener(){}};}},Date,console};app.window=app;vm.createContext(app);
vm.runInContext(appSource.replace(/\ninit\(\);\s*$/,''),app);
const exported=app.SurviveDrive.buildSessionExport();

for(const id of ['waypoints','save-potential-waypoint','map-save-waypoint','potential-waypoint-list','potential-waypoint-status']){
  assert.doesNotMatch(html,new RegExp('id="'+id+'"'),`${id} must stay removed from the UI`);
}
assert.doesNotMatch(html,/Required Waypoints|potential waypoint|liked cell/i,'the UI must not offer required stops or liked-cell route promotion');
assert.doesNotMatch(appSource,/potentialWaypoint|potential_waypoint|savePotentialWaypoint|usePotentialWaypoint/i,'the app must not restore liked-cell potential-waypoint behavior');
assert.equal(Object.hasOwn(exported,'potential_waypoints'),false,'session export must not carry removed potential waypoints');
assert.match(html,/Start Escape Gates/,'Start Escape Gate selection remains available');
assert.match(html,/Destination Approach Gates/,'Destination Approach Gate selection remains available');
console.log('Passed removal regression: Required Waypoints and liked-cell potential waypoints are absent from the UI, app, and session export; paired escape-gate routing remains covered by shotgun-gate tests. No provider calls.');
