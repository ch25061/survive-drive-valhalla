// Voiceover for the authentic Los Angeles desktop recording.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {KokoroTTS} from 'kokoro-js';
import {env} from '@huggingface/transformers';
import {spawnSync} from 'node:child_process';

env.cacheDir='./work/tutorial-tts/cache';
const chapters=JSON.parse(await readFile('tutorial/live-la-final-script.json','utf8'));
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8'});
await mkdir('work/live-la-tts',{recursive:true});
for(const chapter of chapters){
  const clean=chapter.narration
    .replace(/\bAVM\b/g,'A V M')
    .replace(/\bValhalla\b/g,'Val halla')
    .replace(/\bPPSQFT\b/g,'price per square foot');
  const sentences=clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[clean];
  const parts=[];let current='';
  for(const sentence of sentences){
    if(current&&(current+' '+sentence).trim().split(/\s+/).length>65){parts.push(current.trim());current=''}
    current+=' '+sentence.trim();
  }
  if(current.trim())parts.push(current.trim());
  const paths=[];
  for(const [index,part] of parts.entries()){
    const wav=`work/live-la-tts/${chapter.id}-${index+1}.wav`;
    await (await tts.generate(part,{voice:'af_heart',speed:0.95})).save(wav);
    paths.push(wav);
  }
  const concat=`work/live-la-tts/${chapter.id}.txt`;
  await writeFile(concat,'ffconcat version 1.0\n'+paths.map(path=>`file '${process.cwd().replaceAll('\\','/')}/${path}'`).join('\n')+'\n');
  const output=`work/live-la-tts/${chapter.id}.wav`;
  const done=spawnSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',concat,'-c:a','pcm_s16le',output],{stdio:'inherit'});
  if(done.status!==0)throw Error('Failed to join '+chapter.id);
  console.log(chapter.id,output);
}
