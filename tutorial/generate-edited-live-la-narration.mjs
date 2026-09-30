import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {KokoroTTS} from 'kokoro-js';
import {env} from '@huggingface/transformers';
import {spawnSync} from 'node:child_process';

env.cacheDir='./work/tutorial-tts/cache';
env.allowRemoteModels=false;
const script=JSON.parse(await readFile('tutorial/live-la-edited-script.json','utf8'));
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8'});
const dir='work/edited-live-la-tts';
await mkdir(dir,{recursive:true});
const selected=new Set(process.argv.slice(2));
for(const chapter of script){
  if(selected.size&&!selected.has(chapter.id))continue;
  const clean=chapter.narration.replace(/\bAVM\b/g,'A V M').replace(/\bValhalla\b/g,'Val halla');
  const sentences=clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[clean];
  const parts=[];let current='';
  for(const sentence of sentences){
    if(current&&(current+' '+sentence).trim().split(/\s+/).length>60){parts.push(current.trim());current='';}
    current+=' '+sentence.trim();
  }
  if(current.trim())parts.push(current.trim());
  const paths=[];
  for(const [index,part] of parts.entries()){
    const wav=`${dir}/${chapter.id}-${index+1}.wav`;
    await (await tts.generate(part,{voice:'af_heart',speed:0.98})).save(wav);
    paths.push(wav);
  }
  const concat=`${dir}/${chapter.id}.ffconcat`;
  await writeFile(concat,'ffconcat version 1.0\n'+paths.map(path=>`file '${process.cwd().replaceAll('\\','/')}/${path}'`).join('\n')+'\n');
  const done=spawnSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',concat,'-c:a','pcm_s16le',`${dir}/${chapter.id}.wav`],{stdio:'inherit'});
  if(done.status!==0)throw Error('Could not join '+chapter.id);
  console.log('Narrated '+chapter.title);
}
