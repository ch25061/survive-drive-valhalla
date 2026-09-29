import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import worker from './dist/server/index.js';

const site='https://sd.test';
const fetchPath=(path,options={},env={})=>worker.fetch(new Request(site+path,options),env);
const html=await fetchPath('/tutorial.html');
assert.equal(html.status,200);
const page=await html.text();
const actual=await readFile('tutorial/survive-drive-getting-started.mp4');
const videoHash=createHash('sha256').update(actual).digest('hex').slice(0,16);
const expectedKey=`survive-drive/getting-started-${videoHash}.mp4`;
const laActual=await readFile('tutorial/survive-drive-la-workflow.mp4');
const laHash=createHash('sha256').update(laActual).digest('hex').slice(0,16);
const laKey=`survive-drive/la-workflow-${laHash}.mp4`;
assert.match(page,new RegExp(`tutorial-video\\.mp4\\?v=${videoHash}`));
assert.match(page,new RegExp(`tutorial-la-video\\.mp4\\?v=${laHash}`));
assert.match(page,/Rank a long Los Angeles area trip/);
assert.match(page,/illustrative training data/);
assert.match(page,/Getting started with Survive Drive/);
assert.match(page,/one credit, or one cent/);
assert.match(page,/ten million uncached lookups would be \$100,000/);
assert.match(page,/topic-cost/);
const home=await (await fetchPath('/')).text();
assert.match(home,/href="\/tutorial.html" target="_blank"/);

const chapters=await (await fetchPath('/tutorial-chapters.json')).json();
assert.equal(chapters.length,10);
assert.equal(chapters[0].start,0);
assert.ok(chapters.every((entry,index)=>index===0||entry.start>chapters[index-1].start));
const laChapters=await (await fetchPath('/tutorial-la-chapters.json')).json();
assert.equal(laChapters.length,9);
assert.equal(laChapters[0].start,0);
assert.ok(laChapters.every((entry,index)=>index===0||entry.start>laChapters[index-1].start));
assert.match(await (await fetchPath('/tutorial-la-captions.vtt')).text(),/^WEBVTT/);
assert.equal((await fetchPath('/tutorial-la-poster.png')).headers.get('Content-Type'),'image/png');
const captions=await (await fetchPath('/tutorial-captions.vtt')).text();
assert.match(captions,/^WEBVTT/);
const poster=await fetchPath('/tutorial-poster.png');
assert.equal(poster.headers.get('Content-Type'),'image/png');
assert.ok((await poster.arrayBuffer()).byteLength>100000);

const stored=new Map();
const r2={
  async put(key,bytes){assert.ok([expectedKey,laKey].includes(key));stored.set(key,Uint8Array.from(bytes))},
  async get(key,{range}={}){
    assert.ok([expectedKey,laKey].includes(key));
    const dataBytes=stored.get(key);
    if(!dataBytes)return null;
    const match=/^bytes=(\d+)-(\d*)$/.exec(range?.get('Range')??'');
    const start=match?Number(match[1]):0,end=match?Math.min(match[2]?Number(match[2]):dataBytes.length-1,dataBytes.length-1):dataBytes.length-1;
    const data=dataBytes.subarray(start,end+1);
    return {size:dataBytes.length,httpEtag:'"tutorial-test"',...(match?{range:{offset:start,length:data.length}}:{}),body:new Blob([data]).stream(),writeHttpMetadata(headers){headers.set('Content-Type','video/mp4')}};
  },
};
const media={TUTORIAL_MEDIA:r2};
const first=await fetchPath('/tutorial-video.mp4',{},media);
assert.equal(first.status,200);
assert.equal(first.headers.get('Content-Type'),'video/mp4');
assert.equal(Number(first.headers.get('Content-Length')),stored.get(expectedKey).length);
assert.deepEqual(Buffer.from(await first.arrayBuffer()),actual);
const partial=await fetchPath('/tutorial-video.mp4',{headers:{Range:'bytes=0-15'}},media);
assert.equal(partial.status,206);
assert.equal(partial.headers.get('Content-Range'),`bytes 0-15/${actual.length}`);
assert.deepEqual(Buffer.from(await partial.arrayBuffer()),actual.subarray(0,16));
const laFirst=await fetchPath('/tutorial-la-video.mp4',{},media);
assert.equal(laFirst.status,200);
assert.equal(laFirst.headers.get('Content-Type'),'video/mp4');
assert.deepEqual(Buffer.from(await laFirst.arrayBuffer()),laActual);
const laPartial=await fetchPath('/tutorial-la-video.mp4',{headers:{Range:'bytes=0-15'}},media);
assert.equal(laPartial.status,206);
assert.equal(laPartial.headers.get('Content-Range'),`bytes 0-15/${laActual.length}`);
assert.deepEqual(Buffer.from(await laPartial.arrayBuffer()),laActual.subarray(0,16));
console.log('Both tutorial videos, chapters, captions, posters, R2 seeding, and ranged playback verified.');
