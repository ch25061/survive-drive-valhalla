// Generate the recorded narration locally from the storyboard's scene text.
// Run after installing this directory's package dependencies.
// Model weights are cached outside the published Site.
import { readFile, mkdir } from 'node:fs/promises';
import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';

env.cacheDir = './work/tutorial-tts/cache';
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  dtype: 'q8',
});
await mkdir('work/tutorial-tts', { recursive: true });
for (let index = 1; index <= 10; index++) {
  const number = String(index).padStart(2, '0');
  let script = await readFile(`work/tutorial-voice-${number}.txt`, 'utf8');
  script = script.replace(/\bAVM\b/g, 'A V M').replace(/\bSD\b/g, 'S D')
    .replace(/\bRentCast\b/g, 'Rent Cast');
  const audio = await tts.generate(script, { voice: 'af_heart', speed: 1 });
  const path = `work/tutorial-tts/narration-${number}.wav`;
  await audio.save(path);
  console.log(`${number}: ${path}`);
}
