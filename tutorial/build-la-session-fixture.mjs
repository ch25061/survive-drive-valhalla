// Construct canonical map cells for a clearly illustrative offline training session.
// The road lines, times, and AVM values remain invented; no provider is called.
import {readFile,writeFile} from 'node:fs/promises';
await import('../dist/route-avm.js');
const source=JSON.parse(await readFile('tutorial/la-demo-synthetic.json','utf8'));
const values=[
  [180,430,450,465,490,null,470,480,510,525,535,550],
  [190,175,410,420,430,445,460,470,null,null,null,null],
  [190,370,null,null,null,null,null,null,null,null,null,null],
  [180,170,160,390,410,430,450,470,480,490,null,null],
];
for(const [index,route] of source.candidates.routes.entries()){
  route.training_only=true;
  route.authority_ranges=[];
  const mapped=globalThis.SurviveAvm.mapRoute(route);
  const sourceValues=values[index];
  for(const [cellIndex,cell] of mapped.cells.entries()){
    const bin=Math.min(sourceValues.length-1,Math.floor(cellIndex*sourceValues.length/mapped.cells.length));
    const value=sourceValues[bin];
    cell.estimate_ppsqft=value;
    cell.value_origin=value===null?'pending':'illustrative_training_value';
    cell.source_artifact=value===null?null:'Synthetic tutorial; not provider evidence';
  }
  Object.assign(route,mapped);
  route.authority_ranges=[];
  route.authority_only_cell_count=0;
}
source.description='Illustrative training session filmed in the real Survive Drive interface. Route lines, travel times, and AVM values are invented. No Valhalla, Census, or RentCast request.';
await writeFile('tutorial/la-demo-screen-session.json',JSON.stringify(source)+'\n');
console.log(source.candidates.routes.map(r=>r.name+': '+r.cells.length+' canonical training cells').join('\n'));
