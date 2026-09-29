// Locally render narration for the illustrated Los Angeles workflow video.
import {readFile,mkdir} from 'node:fs/promises';
import {KokoroTTS} from 'kokoro-js';
import {env} from '@huggingface/transformers';

env.cacheDir='./work/tutorial-tts/cache';
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8'});
await mkdir('work/la-tts',{recursive:true});
const requested=Number(process.argv[2]);
const indices=Number.isInteger(requested)&&requested>=1&&requested<=9?[requested]:Array.from({length:9},(_,i)=>i+1);
for(const index of indices){
  const number=String(index).padStart(2,'0');
  let script=await readFile(`work/la-voice-${number}.txt`,'utf8');
  script=script.replace(/\bAVM\b/g,'A V M').replace(/\bSD\b/g,'S D').replace(/\bValhalla\b/g,'Val halla').replace(/\bPPSQFT\b/g,'price per square foot');
  const audio=await tts.generate(script,{voice:'af_heart',speed:1});
  const path=`work/la-tts/narration-${number}.wav`;
  await audio.save(path);
  console.log(`${number}: ${path}`);
}
