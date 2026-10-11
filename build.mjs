import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
await cp('node_modules/qrcode-generator/dist/qrcode.js','dist/qrcode.js');
const files=['phone-handoff.js','phone-route.html','phone-route.js','phone-route.css','qrcode.js','qrcode-LICENSE.txt','h3-pinned.js','h3-LICENSE.txt','index.html','style.css','here-decoder.js','valhalla-decoder.js','route-avm.js','shotgun-gates.js','census-ring.js','census-ring-ui.js','pool-screening.js','red-exclusion-zones.js','app.js','reference.json','intersection-catalog-chicago-v1.json','tutorial.html','tutorial.css','tutorial.js','tutorial-la.css','tutorial-la.js','tutorial-la-session.js','android.html','rs-android-build.json','rs-osmand-companion.apk'];
await mkdir('dist/client',{recursive:true});
for(const file of files)await cp('dist/'+file,'dist/client/'+file);
await cp('tutorial/poster.png','dist/client/tutorial-poster.png');
await cp('tutorial/captions.vtt','dist/client/tutorial-captions.vtt');
await cp('tutorial/chapters.json','dist/client/tutorial-chapters.json');
await cp('tutorial/la-poster.png','dist/client/tutorial-la-poster.png');
await cp('tutorial/la-captions.vtt','dist/client/tutorial-la-captions.vtt');
await cp('tutorial/la-chapters.json','dist/client/tutorial-la-chapters.json');
await cp('tutorial/la-session-poster.png','dist/client/tutorial-la-session-poster.png');
await cp('tutorial/la-session-captions.vtt','dist/client/tutorial-la-session-captions.vtt');
await cp('tutorial/la-session-chapters.json','dist/client/tutorial-la-session-chapters.json');
await mkdir('dist/server',{recursive:true});
const reference=JSON.parse(await readFile('dist/reference.json','utf8'));
const page=await readFile('dist/index.html','utf8');
const css=await readFile('dist/style.css','utf8');
const js=await readFile('dist/app.js','utf8');
const decoder=await readFile('dist/here-decoder.js','utf8');
const valhallaDecoder=await readFile('dist/valhalla-decoder.js','utf8');
const h3=await readFile('dist/h3-pinned.js','utf8');
const gridContract=JSON.parse(await readFile('global-grid-contract.json','utf8'));
if(gridContract.contract!=='H3R8-V1'||gridContract.library!=='h3-js@4.3.0'||gridContract.resolution!==8||gridContract.center_decimals!==8||gridContract.library_sha256!==createHash('sha256').update(h3).digest('hex'))throw Error('The immutable global grid contract or pinned library changed. Build blocked.');
const mapper=await readFile('dist/route-avm.js','utf8');
const geometryContext={};vm.createContext(geometryContext);vm.runInContext(h3,geometryContext);vm.runInContext(mapper,geometryContext);
for(const fixture of gridContract.cells){const cell=geometryContext.SurviveAvm.cellAt(...fixture.input),polygonHash=createHash('sha256').update(JSON.stringify(cell.polygon)).digest('hex');if(cell.cell_id!==fixture.cell_id||cell.center_tag!==fixture.center_tag||polygonHash!==fixture.polygon_sha256)throw Error('Permanent AVM grid geometry changed. Build blocked: '+fixture.cell_id);}

const shotgun=await readFile('dist/shotgun-gates.js','utf8');
const pool=await readFile('dist/pool-screening.js','utf8');
const redZones=await readFile('dist/red-exclusion-zones.js','utf8');
const intersections=await readFile('dist/intersection-catalog-chicago-v1.json','utf8');
const ring=await readFile('dist/census-ring.js','utf8');
const ringUI=await readFile('dist/census-ring-ui.js','utf8');
const ringServer=await readFile('server/census-ring.js','utf8');
const valhallaProvider=await readFile('server/valhalla-provider.js','utf8');
const core=await readFile('server/worker.js','utf8');
const phoneServer=await readFile('server/phone-handoff.js','utf8');
const phoneAssets={};for(const file of ['phone-handoff.js','phone-route.html','phone-route.js','phone-route.css','qrcode.js','qrcode-LICENSE.txt'])phoneAssets['/'+file]={body:await readFile('dist/'+file,'utf8'),type:file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8'};
const androidPage=await readFile('dist/android.html','utf8');
const androidBuild=await readFile('dist/rs-android-build.json','utf8');
const androidInstaller=await readFile('dist/rs-osmand-companion.apk');
if(JSON.parse(androidBuild).sha256!==createHash('sha256').update(androidInstaller).digest('hex'))throw Error('Android installer checksum mismatch.');
const tutorialVideoBytes=await readFile('tutorial/survive-drive-getting-started.mp4');
const tutorialVideoHash=createHash('sha256').update(tutorialVideoBytes).digest('hex').slice(0,16);
const laVideoBytes=await readFile('tutorial/survive-drive-la-workflow.mp4');
const laVideoHash=createHash('sha256').update(laVideoBytes).digest('hex').slice(0,16);
const laSessionVideoBytes=await readFile('tutorial/survive-drive-la-screen-session.mp4');
const laSessionVideoHash=createHash('sha256').update(laSessionVideoBytes).digest('hex').slice(0,16);
const tutorialPage=(await readFile('dist/tutorial.html','utf8'))
  .replace('/tutorial-video.mp4','/tutorial-video.mp4?v='+tutorialVideoHash)
  .replace('/tutorial-captions.vtt','/tutorial-captions.vtt?v='+tutorialVideoHash)
  .replace('/tutorial-la-video.mp4','/tutorial-la-video.mp4?v='+laVideoHash)
  .replace('/tutorial-la-captions.vtt','/tutorial-la-captions.vtt?v='+laVideoHash)
  .replace('/tutorial-la-session-video.mp4','/tutorial-la-session-video.mp4?v='+laSessionVideoHash)
  .replace('/tutorial-la-session-captions.vtt','/tutorial-la-session-captions.vtt?v='+laSessionVideoHash);
await writeFile('dist/client/tutorial.html',tutorialPage);
const tutorialCss=await readFile('dist/tutorial.css','utf8');
const tutorialJs=await readFile('dist/tutorial.js','utf8');
const tutorialLaCss=await readFile('dist/tutorial-la.css','utf8');
const tutorialLaJs=await readFile('dist/tutorial-la.js','utf8');
const tutorialLaSessionJs=await readFile('dist/tutorial-la-session.js','utf8');
const tutorialCaptions=await readFile('tutorial/captions.vtt','utf8');
const tutorialChapters=await readFile('tutorial/chapters.json','utf8');
const tutorialPoster=(await readFile('tutorial/poster.png')).toString('base64');
const tutorialVideo=tutorialVideoBytes.toString('base64');
const laCaptions=await readFile('tutorial/la-captions.vtt','utf8');
const laChapters=await readFile('tutorial/la-chapters.json','utf8');
const laPoster=(await readFile('tutorial/la-poster.png')).toString('base64');
const laVideo=laVideoBytes.toString('base64');
const laSessionCaptions=await readFile('tutorial/la-session-captions.vtt','utf8');
const laSessionChapters=await readFile('tutorial/la-session-chapters.json','utf8');
const laSessionPoster=(await readFile('tutorial/la-session-poster.png')).toString('base64');
const laSessionVideo=laSessionVideoBytes.toString('base64');
const header='const REFERENCE='+JSON.stringify(reference)+';\nconst ASSETS='+JSON.stringify({...phoneAssets,'/android.html':{body:androidPage,type:'text/html; charset=utf-8'},'/rs-android-build.json':{body:androidBuild,type:'application/json'},'/rs-osmand-companion.apk':{body:androidInstaller.toString('base64'),type:'application/vnd.android.package-archive',encoding:'base64'},'/':{body:page,type:'text/html; charset=utf-8'},'/index.html':{body:page,type:'text/html; charset=utf-8'},'/style.css':{body:css,type:'text/css; charset=utf-8'},'/here-decoder.js':{body:decoder,type:'text/javascript; charset=utf-8'},'/valhalla-decoder.js':{body:valhallaDecoder,type:'text/javascript; charset=utf-8'},'/h3-pinned.js':{body:h3,type:'text/javascript; charset=utf-8'},'/h3-LICENSE.txt':{body:await readFile('dist/h3-LICENSE.txt','utf8'),type:'text/plain; charset=utf-8'},'/route-avm.js':{body:mapper,type:'text/javascript; charset=utf-8'},'/shotgun-gates.js':{body:shotgun,type:'text/javascript; charset=utf-8'},'/pool-screening.js':{body:pool,type:'text/javascript; charset=utf-8'},'/red-exclusion-zones.js':{body:redZones,type:'text/javascript; charset=utf-8'},'/census-ring.js':{body:ring,type:'text/javascript; charset=utf-8'},'/census-ring-ui.js':{body:ringUI,type:'text/javascript; charset=utf-8'},'/app.js':{body:js,type:'text/javascript; charset=utf-8'},'/reference.json':{body:JSON.stringify(reference),type:'application/json'},'/intersection-catalog-chicago-v1.json':{body:intersections,type:'application/json'}})+';\n';
const tutorialHeader='const TUTORIAL_ASSETS='+JSON.stringify({'/tutorial.html':{body:tutorialPage,type:'text/html; charset=utf-8'},'/tutorial.css':{body:tutorialCss,type:'text/css; charset=utf-8'},'/tutorial.js':{body:tutorialJs,type:'text/javascript; charset=utf-8'},'/tutorial-la.css':{body:tutorialLaCss,type:'text/css; charset=utf-8'},'/tutorial-la.js':{body:tutorialLaJs,type:'text/javascript; charset=utf-8'},'/tutorial-la-session.js':{body:tutorialLaSessionJs,type:'text/javascript; charset=utf-8'},'/tutorial-captions.vtt':{body:tutorialCaptions,type:'text/vtt; charset=utf-8'},'/tutorial-chapters.json':{body:tutorialChapters,type:'application/json; charset=utf-8'},'/tutorial-poster.png':{body:tutorialPoster,type:'image/png',encoding:'base64'},'/tutorial-la-captions.vtt':{body:laCaptions,type:'text/vtt; charset=utf-8'},'/tutorial-la-chapters.json':{body:laChapters,type:'application/json; charset=utf-8'},'/tutorial-la-poster.png':{body:laPoster,type:'image/png',encoding:'base64'},'/tutorial-la-session-captions.vtt':{body:laSessionCaptions,type:'text/vtt; charset=utf-8'},'/tutorial-la-session-chapters.json':{body:laSessionChapters,type:'application/json; charset=utf-8'},'/tutorial-la-session-poster.png':{body:laSessionPoster,type:'image/png',encoding:'base64'}})+';\nconst TUTORIAL_VIDEO_KEY='+JSON.stringify('survive-drive/getting-started-'+tutorialVideoHash+'.mp4')+';\nconst VIDEO_SEED='+JSON.stringify(tutorialVideo)+';\nconst LA_VIDEO_KEY='+JSON.stringify('survive-drive/la-workflow-'+laVideoHash+'.mp4')+';\nconst LA_VIDEO_SEED='+JSON.stringify(laVideo)+';\nconst LA_SESSION_VIDEO_KEY='+JSON.stringify('survive-drive/la-screen-session-'+laSessionVideoHash+'.mp4')+';\nconst LA_SESSION_VIDEO_SEED='+JSON.stringify(laSessionVideo)+';\n';
await writeFile('dist/server/index.js',header+tutorialHeader+'(function(){const process=undefined,module=undefined,exports=undefined,define=undefined;'+h3+'}).call(globalThis);\n'+mapper+'\n'+ring+'\n'+ringServer+'\n'+valhallaProvider+'\n'+phoneServer+'\n'+core);
await mkdir('dist/.openai',{recursive:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Built Worker, browser app, and generated database migrations.');
