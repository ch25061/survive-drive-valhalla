import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const helper=source.match(/function fitRouteMapToViewport\([\s\S]*?\n\}/)?.[0];assert.ok(helper);
assert.match(source,/if\(fitViewport\)fitRouteMapToViewport\(\);if\(focusRed\)/,'map resizing occurs before fitting the route');
assert.match(source,/else if\(shouldFitBounds\)map\.fitBounds\(routeLayer\.getBounds\(\),\{padding:\[35,35\],animate:false\}\)/,'the visible-route fit completes without a pending zoom animation');
assert.match(source,/\$\('fit-map'\)\.addEventListener\('click',\(\)=>\{if\(map&&routeLayer\)\{fitRouteMapToViewport\(\);map\.fitBounds/,'Show entire route uses the same visible-page fit without repainting all known cells');
assert.match(source,/fitViewport:source==='candidate-card'/,'only deliberate card selection requests page fitting');

function harness({height=1000,top=540,banner=null,visualViewport}={}){
  let mapTop=top,invalidations=0;const scrolls=[];
  const mapElement={style:{height:'780px'},getBoundingClientRect(){return{top:mapTop,bottom:mapTop+parseFloat(this.style.height)};}};
  const window={innerHeight:height,visualViewport,scrollBy(options){scrolls.push(options);mapTop-=options.top;}};
  const map={invalidateSize(options){assert.deepEqual(JSON.parse(JSON.stringify(options)),{pan:false,animate:false});invalidations++;}};
  const ctx=vm.createContext({window,map,$:id=>id==='map'?mapElement:banner});vm.runInContext(helper,ctx);
  return{fit:()=>ctx.fitRouteMapToViewport(),window,mapElement,scrolls,get invalidations(){return invalidations;},get top(){return mapTop;}};
}
const cropped=harness();assert.equal(cropped.fit(),true);
assert.equal(cropped.mapElement.style.height,'444px','a map starting halfway down the page fits into the remaining visible height');
assert.equal(cropped.scrolls.length,0,'cards remain visible when enough room remains below them');
assert.equal(cropped.invalidations,1,'Leaflet measures the new height before it fits');
assert.ok(cropped.mapElement.getBoundingClientRect().bottom<=984);

const belowFold=harness({top:920});belowFold.fit();
assert.equal(belowFold.top,16);assert.equal(belowFold.mapElement.style.height,'968px');
assert.equal(belowFold.scrolls.length,1,'a nearly off-screen map is brought fully into view once');
assert.equal(belowFold.scrolls[0].behavior,'instant','the fit uses the final scroll position');
const aboveFold=harness({top:-180});aboveFold.fit();assert.equal(aboveFold.top,16);

const sticky=harness({top:950,banner:{hidden:false,getBoundingClientRect:()=>({top:8,bottom:90})}});
sticky.fit();assert.equal(sticky.top,106);assert.equal(sticky.mapElement.style.height,'878px','a visible sticky progress banner does not cover the fitted route');

const small=harness({height:480,top:400});small.fit();
assert.equal(small.top,16);assert.equal(small.mapElement.style.height,'448px','short windows do not inherit the desktop 570px minimum');
const zoomed=harness({height:1000,top:700,visualViewport:{height:500,offsetTop:100}});zoomed.fit();
assert.equal(zoomed.top,116);assert.equal(zoomed.mapElement.style.height,'468px','the visual viewport controls the available height when zoomed');
const unavailable=harness({height:undefined});unavailable.window.innerHeight=undefined;
assert.equal(unavailable.fit(),false);assert.equal(unavailable.invalidations,0,'headless/fallback layouts remain usable');
console.log('Visible-page route fit passed: cropped and off-screen maps, sticky banners, short windows, visual viewport zoom, immediate size measurement, explicit actions, and no provider calls.');
