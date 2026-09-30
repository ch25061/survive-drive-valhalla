// Render the approved human-sounding Kokoro voice for the longer screen session.
import {readFile,mkdir} from 'node:fs/promises';
import {KokoroTTS} from 'kokoro-js';
import {env} from '@huggingface/transformers';
import {spawnSync} from 'node:child_process';

env.cacheDir='./work/tutorial-tts/cache';
const chapters=JSON.parse(await readFile('tutorial/la-session-script.json','utf8'));
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8'});
await mkdir('work/la-session-tts',{recursive:true});
for(const [index,chapter] of chapters.entries()){
  const text=chapter.narration.replace(/\bAVM\b/g,'A V M').replace(/\bSD\b/g,'S D').replace(/\bValhalla\b/g,'Val halla').replace(/\bPPSQFT\b/g,'price per square foot');
  const sentences=text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[text];
  const parts=[];let current='';
  for(const sentence of sentences){
    if(current && (current+' '+sentence).trim().split(/\s+/).length>65){parts.push(current.trim());current=''}
    current+=' '+sentence.trim();
  }
  if(current.trim())parts.push(current.trim());
  const partFiles=[];
  for(const [partIndex,part] of parts.entries()){
    const audio=await tts.generate(part,{voice:'af_heart',speed:1});
    const partFile=`work/la-session-tts/part-${String(index+1).padStart(2,'0')}-${String(partIndex+1).padStart(2,'0')}.wav`;
    await audio.save(partFile);partFiles.push(partFile);
  }
  const file=`work/la-session-tts/narration-${String(index+1).padStart(2,'0')}.wav`;
  const concatFile=`work/la-session-tts/concat-${String(index+1).padStart(2,'0')}.txt`;
  const {writeFile}=await import('node:fs/promises');
  await writeFile(concatFile,'ffconcat version 1.0\n'+partFiles.map(path=>`file '${process.cwd().replaceAll('\\','/')+'/'+path}'`).join('\n')+'\n');
  const command=spawnSync('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',concatFile,'-c:a','pcm_s16le',file],{stdio:'inherit'});
  if(command.status!==0)throw Error('Narration concatenation failed: '+chapter.id);
  console.log(chapter.id,file,parts.length+' parts');
}
