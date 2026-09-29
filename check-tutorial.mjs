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
assert.match(page,new RegExp(`tutorial-video\\.mp4\\?v=${videoHash}`));
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
const captions=await (await fetchPath('/tutorial-captions.vtt')).text();
assert.match(captions,/^WEBVTT/);
const poster=await fetchPath('/tutorial-poster.png');
assert.equal(poster.headers.get('Content-Type'),'image/png');
assert.ok((await poster.arrayBuffer()).byteLength>100000);

let stored=null;
const r2={
  async put(key,bytes){assert.equal(key,expectedKey);stored=Uint8Array.from(bytes)},
  async get(key,{range}={}){
    assert.equal(key,expectedKey);
    if(!stored)return null;
    const match=/^bytes=(\d+)-(\d*)$/.exec(range?.get('Range')??'');
    const start=match?Number(match[1]):0,end=match?Math.min(match[2]?Number(match[2]):stored.length-1,stored.length-1):stored.length-1;
    const data=stored.subarray(start,end+1);
    return {size:stored.length,httpEtag:'"tutorial-test"',...(match?{range:{offset:start,length:data.length}}:{}),body:new Blob([data]).stream(),writeHttpMetadata(headers){headers.set('Content-Type','video/mp4')}};
  },
};
const media={TUTORIAL_MEDIA:r2};
const first=await fetchPath('/tutorial-video.mp4',{},media);
assert.equal(first.status,200);
assert.equal(first.headers.get('Content-Type'),'video/mp4');
assert.equal(Number(first.headers.get('Content-Length')),stored.length);
assert.deepEqual(Buffer.from(await first.arrayBuffer()),actual);
const partial=await fetchPath('/tutorial-video.mp4',{headers:{Range:'bytes=0-15'}},media);
assert.equal(partial.status,206);
assert.equal(partial.headers.get('Content-Range'),`bytes 0-15/${actual.length}`);
assert.deepEqual(Buffer.from(await partial.arrayBuffer()),actual.subarray(0,16));
console.log('Tutorial page, chapters, captions, poster, R2 seeding, and ranged playback verified.');
