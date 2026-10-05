import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import './dist/red-exclusion-zones.js';

const {clusterRedCells,polygonsPerimeterMeters}=globalThis.RedExclusionZones;
assert.equal(typeof clusterRedCells,'function','the browser utility exposes its pure clustering function');
assert.equal(typeof polygonsPerimeterMeters,'function','the browser utility exposes a pure exclusion-perimeter estimator');
const testSquare=[[0,0],[.01,0],[.01,.01],[0,.01],[0,0]];
assert.ok(polygonsPerimeterMeters([testSquare])>4440&&polygonsPerimeterMeters([testSquare])<4460,'perimeter estimate uses meter-scale spherical distances and includes the closed ring');

function hexCell(grid,q,r,value=150){
  const x=q+r/2,y=Math.sqrt(3)*r/2,radius=1/Math.sqrt(3),polygon=Array.from({length:6},(_,i)=>{
    const angle=(30+i*60)*Math.PI/180;
    return[x+radius*Math.cos(angle),y+radius*Math.sin(angle)];
  });
  polygon.push(polygon[0].slice());
  return{cell_id:`${grid}-Q${q>=0?'+':''}${q}-R${r>=0?'+':''}${r}`,latitude:y,longitude:x,estimate_ppsqft:value,polygon};
}

const adjacent=[hexCell('CHI1K-V1',0,0),hexCell('CHI1K-V1',1,0)];
const neighbor=hexCell('CHI1K-V1',2,0),separate=hexCell('CHI1K-V1',8,0),notRed=hexCell('CHI1K-V1',9,0,200),otherGrid=hexCell('REG1K-V1-LAT+41-LON-087',0,0);
const clusters=clusterRedCells([...adjacent,neighbor,separate,notRed,otherGrid,adjacent[0]],200);
assert.equal(clusters.length,3,'adjacent Red cells merge; a separated Red cell and a different grid remain distinct');
assert.deepEqual(clusters.map(cluster=>cluster.cell_count),[3,1,1],'all connected components are preserved, including single-cell components');
assert.equal(clusters.reduce((sum,cluster)=>sum+cluster.cell_count,0),5,'duplicate IDs and cells at the cutoff are not counted twice');
const merged=clusters[0];
assert.equal(merged.rings.length,1,'a compact connected cluster traces as one outline');
assert.equal(merged.rings[0].length-1,14,'three side-adjacent hexagons share and remove their two internal edges');
assert.deepEqual(merged.rings[0][0],merged.rings[0].at(-1),'the draft zone outline is closed');

const radiusTwo=[];
for(let q=-2;q<=2;q++)for(let r=-2;r<=2;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=2)radiusTwo.push(hexCell('MASK-TEST',q,r));
const protectedCenter='MASK-TEST-Q+0-R+0';
const carved=clusterRedCells(radiusTwo,200,{maskedCellIds:[protectedCenter]});
assert.equal(carved.reduce((sum,zone)=>sum+zone.cell_count,0),16,'the preferred-road cell and its minimal connector path stay outside the MUST AVOID polygons');
assert.equal(carved.masked_connector_cell_ids.length,2,'only the two additional red cells on the shortest boundary path are opened');
function contains(point,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>point[1])!==(yj>point[1])&&point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
assert.ok(carved.every(zone=>zone.rings.every(ring=>!contains([0,0],ring))),'no filled Valhalla exclusion ring encloses the protected road cell');
assert.equal(clusterRedCells(radiusTwo,200).reduce((sum,zone)=>sum+zone.cell_count,0),19,'without a matching Prefer setting, the full red component remains excluded');

const app=fs.readFileSync('dist/app.js','utf8');
const endpointStart=app.indexOf('function knownTripEndpointCellIds(cells){'),endpointEnd=app.indexOf('function routeExclusionAreaCells(){',endpointStart);
assert.ok(endpointStart>=0&&endpointEnd>endpointStart,'known endpoint masking is a focused helper');
const endpointHelper=app.slice(endpointStart,endpointEnd),startCell=radiusTwo.find(cell=>cell.cell_id==='MASK-TEST-Q+0-R+0'),destinationCell=radiusTwo.find(cell=>cell.cell_id==='MASK-TEST-Q+2-R+0'),unrelatedCell=radiusTwo.find(cell=>cell.cell_id==='MASK-TEST-Q-2-R+0'),tripInputs={origin:`${startCell.latitude},${startCell.longitude}`,destination:`${destinationCell.latitude},${destinationCell.longitude}`},endpointIds=new Function('$','coordinates','polygonContains',`${endpointHelper};return knownTripEndpointCellIds;`)(id=>({value:tripInputs[id]}),value=>value.split(',').map(Number),contains)([startCell,destinationCell,unrelatedCell]);
assert.deepEqual([...endpointIds].sort(),[startCell.cell_id,destinationCell.cell_id].sort(),'known Start and Destination cells are protected independently of road preferences, while unrelated red cells remain eligible');
assert.match(app,/drawRedExclusionZoneLayer\(\)/,'the clustering layer is drawn with the known-cell map');
assert.match(app,/map-visible known cells below \$\x27\+cutoff/,'the preview is limited to known cells below the independent zone threshold in the current map view');
assert.match(app,/map-visible known cells below \$'\+cutoff[\s\S]*?New batches also include qualifying known cells within 30 miles of the trip gates/,'the map preview distinguishes its view from the polygons frozen into route batches');
assert.match(app,/function routeExclusionAreaCells\(\)[\s\S]*?function routeExclusionPlan\(masks=routeHighwayMasks\)[\s\S]*?options\.highways===1[\s\S]*?options\.tolls===1[\s\S]*?endpointMask=knownTripEndpointCellIds\(redCells\)[\s\S]*?maskedIds=new Set\(\[\.\.\.highwayMask,\.\.\.tollwayMask,\.\.\.endpointMask\]\)[\s\S]*?clusterRedCells\?\.\(redCells,cutoff,\{maskedCellIds:\[\.\.\.maskedIds\]\}\)[\s\S]*?masked_start_destination_cell_count:endpointMask\.size[\s\S]*?connector_cell_count/,'route polygons protect known Start/Destination cells alongside separately preferred road-class masks and carve them out to the cluster boundary');
assert.match(app,/async function refreshAllKnownAvmCellsForRouting\(\)[\s\S]*?provider_calls!==0/,'the full shared cache is refreshed without provider calls before the exclusion set is frozen');
assert.match(app,/exclusion_zones:exclusionPlan/,'the prepared batch stores one frozen full polygon set');
assert.match(app,/polygonsPerimeterMeters\(polygons\)[\s\S]*?perimeter>2850000[\s\S]*?polygon_perimeter_m:perimeter/,'oversized total perimeter is rejected before route attempts and measured perimeter is frozen in the request summary');
assert.match(app,/params:\{\.\.\.request\.params,[\s\S]*?exclude_polygons:draft\.exclusion_zones\.polygons/,'every submitted Valhalla request receives the frozen exclusion rings');
assert.match(app,/async function stageDraft\(\)[\s\S]*?await refreshAllKnownAvmCellsForRouting\(\)[\s\S]*?const options=routeOptionsFromForm\(\),includeHighways=options\.highways===1,includeTollways=options\.tolls===1[\s\S]*?prepareDraft\(routeHighwayMasks\)/,'route generation checks the static graph only for separately preferred road classes before building its batch');
const adapter=fs.readFileSync('server/valhalla-provider.js','utf8');
assert.match(adapter,/validatedExclusionPolygons\(params\.exclude_polygons\)[\s\S]*?exclude_polygons: excludePolygons/,'the provider adapter validates and forwards exclusion polygons to Valhalla');
const worker=fs.readFileSync('server/worker.js','utf8');
assert.match(worker,/exclude_polygons/,'the hosted route adapter accepts the prepared exclusion polygons');
const zoneLayer=app.match(/function drawRedExclusionZoneLayer\(\)[\s\S]*?\nfunction scheduleMapLayoutRefresh/)[0];
assert.match(zoneLayer,/cutoff=exclusionZoneThreshold\(\)/,'zone clustering uses its own cutoff instead of the Red Cell cutoff');
assert.match(zoneLayer,/endpointMask=knownTripEndpointCellIds\(redVisible\)[\s\S]*?maskedIds=new Set\(\[\.\.\.highwayMask,\.\.\.tollwayMask,\.\.\.endpointMask\]\)[\s\S]*?clusterRedCells\(redVisible,cutoff,\{maskedCellIds:\[\.\.\.maskedIds\]\}\)[\s\S]*?known Start\/Destination cells kept outside exclusion zones[\s\S]*?connector corridors/,'the map preview protects known Start/Destination cells and mirrors the route-request masks');
assert.match(app,/function setExclusionZoneThreshold\(value\)[\s\S]*?drawRedExclusionZoneLayer\(\)/,'releasing the zone slider recomputes zones without re-ranking');
assert.match(app,/function newKnownCellQualifiesForExclusionZone\(previousEstimate,newEstimate\)\{return!validMapEstimate\(previousEstimate\)&&validMapEstimate\(newEstimate\)&&newEstimate<exclusionZoneThreshold\(\);\}/,'only a newly known AVM cell strictly below the current exclusion cutoff qualifies for an evidence-triggered recompute');
assert.match(app,/function drawMap\(\{fitBounds=false,focusRed=false,redrawZones=true\}=\{\}\)[\s\S]*?if\(redrawZones\)drawRedExclusionZoneLayer\(\)/,'ordinary map refreshes can skip zone recomputation when AVM evidence does not qualify');
assert.match(app,/function integrateMapCellEvidence\([\s\S]*?redrawZones=!wasKnown&&validMapEstimate\(cell\.estimate_ppsqft\)&&cell\.estimate_ppsqft<exclusionZoneThreshold\(\)[\s\S]*?drawMap\(\{redrawZones\}\)/,'map-cell AVM evidence refreshes zones only for a newly known value below cutoff');
assert.match(app,/function applyPoolEstimate\([\s\S]*?newKnownCellQualifiesForExclusionZone\(cell\.estimate_ppsqft,result\.estimate_ppsqft\)[\s\S]*?return redrawZones/,'route-pool AVM updates report whether any newly known cell falls below cutoff');
assert.match(app,/mapZonesNeedRedraw=applyPoolEstimate\([\s\S]*?refreshSelectedRouteEvidence\(mapZonesNeedRedraw\)/,'automatic evidence batches pass the qualifying-cell condition to the map refresh');
assert.match(app,/zonesNeedRefresh=false[\s\S]*?newKnownCellQualifiesForExclusionZone\(target\.estimate_ppsqft,result\.estimate_ppsqft\)[\s\S]*?drawMap\(\{redrawZones:zonesNeedRefresh\}\)/,'selected-route AVM results use the same strict below-cutoff condition');
assert.match(app,/\$\('exclusion-zone-level'\)\.addEventListener\('change',\(\)=>setExclusionZoneThreshold\(\$\('exclusion-zone-level'\)\.value\)\)/,'the zone threshold is committed only on slider release');
assert.match(zoneLayer,/bubblingMouseEvents:false/,'clicks on zones do not bubble into the general map inspector');
assert.match(zoneLayer,/layer\.on\('click',event=>\{L\.DomEvent\.stopPropagation\(event\)/,'zone clicks are explicitly stopped at the zone layer');
assert.match(zoneLayer,/layer\.on\('click',event=>\{L\.DomEvent\.stopPropagation\(event\);if\(mapPick\)\{consumeTripMapClick\(\[event\.latlng\.lat,event\.latlng\.lng\]\);return;\}selectDraftRedZone\(i\);\}\)/,'an armed Start/Destination map pick wins over selecting a zone');
assert.match(zoneLayer,/color:'#111111'.*weight:2/,'unselected zone boundaries use a thin black outline');
assert.match(zoneLayer,/redExclusionZoneLayers\.push\(layer\)/,'rendered zone layers are retained for selection styling');
assert.match(app,/selectedDraftRedZoneIndex=index;const selectedLayer=redExclusionZoneLayers\[index\];selectedLayer\?\.setStyle\(\{color:'#ffffff',weight:3,opacity:1\}\)/,'selecting a zone changes its outline to thicker white');
assert.match(app,/redExclusionZoneLayers\[selectedDraftRedZoneIndex\]\?\.setStyle\(\{color:'#111111',weight:2,opacity:\.95\}\)/,'the prior zone returns to its black outline when another is selected');
assert.match(app,/function selectDraftRedZone\(index\)\{const cluster=redExclusionZoneShapes\[index\];if\(!cluster\)return;dismissMapAvm\(\);[\s\S]*?boundary edges/,'selecting a zone clears any stale clicked-cell overlay before reporting the zone boundary');
assert.match(app,/function handleMapClick\(pair\)\{if\(consumeTripMapClick\(pair\)\|\|state\.busy\)return;const zoneIndex=draftRedZoneAt\(pair\);if\(zoneIndex>=0\)\{selectDraftRedZone\(zoneIndex\);return;\}/,'the map click handler independently blocks AVM-cell inspection for points inside a draft zone');
assert.match(app,/function draftRedZoneAt\(pair\)\{const point=\[pair\[1\],pair\[0\]\];for\(let index=0;index<redExclusionZoneShapes\.length;index\+\+\)\{const rings=redExclusionZoneShapes\[index\]\.rings\?\?\[\];if\(rings\.length&&polygonContains\(point,rings\[0\]\)\)return index;/,'zone hit testing treats interior pockets within the outer boundary as part of the zone');
const html=fs.readFileSync('dist/index.html','utf8');
assert.match(html,/id="exclusion-zone-level" type="range" min="1" max="1000" step="1" value="200"/,'the absolute-avoid zone level has its own independent PPSQFT slider');
assert.match(html,/independent cutoff controls the candidate MUST AVOID zones[\s\S]*?Red Cell slider remains the more lenient PREFER TO AVOID signal used by normal route ranking/,'the UI explains the hard-zone versus ranking preference distinction');
assert.match(html,/Known Start and Destination cells below this level are also kept outside Exclusion Zones/,'the cutoff instructions explain that known trip endpoints are always protected from zones');
assert.match(html,/id="show-red-cluster-zones" type="checkbox" checked/,'the draft layer is visible by default and can be hidden');
assert.match(html,/red-zone-note[^>]*>\s*<strong>Zone membership:<\/strong> Interior white pockets are still inside the Exclusion Zone/,'the UI makes clear that white interior pockets remain inside the exclusion zone');
assert.match(html,/Interior white pockets are still inside the Exclusion Zone[\s\S]*?Known Start and Destination cells below the Exclusion Zone cutoff are kept outside the filled polygons[\s\S]*?New Valhalla batches receive these polygons/,'the UI explains endpoint protection and distinguishes zone membership from AVM color');
assert.match(html,/red-zone-status[^>]*role="status"/,'the UI reports the draft-zone count and scope accessibly');
const css=fs.readFileSync('dist/style.css','utf8');
assert.match(css,/\.exclusion-zone-level input\[type="range"\][^}]*accent-color:#bd2947/,'the exclusion-zone slider has its own distinct visual treatment');
assert.match(html,/Valhalla MUST AVOID zones · independent level/,'the map legend names the separate hard-avoid routing layer');
assert.match(css,/\.leaflet-draft-red-zones-pane path\.leaflet-interactive:focus\{outline:none!important\}/,'pointer focus does not show a misleading rectangle around the zone bounds');
assert.match(css,/\.leaflet-draft-red-zones-pane path\.leaflet-interactive:focus-visible\{outline:none!important;stroke:#142238!important/,'keyboard focus follows the actual zone perimeter');

console.log('Red-cell cluster zones passed: connected axial cells dissolve to closed outlines, separate grids stay separate, cutoff behavior holds, and the frozen polygons reach every Valhalla route request.');
