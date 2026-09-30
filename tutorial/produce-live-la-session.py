"""Edit the newly captured live LA session at a readable pace."""
import json
import re
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAPTURE = ROOT.parent.parent / 'work/la-fresh-live-capture.mp4'
SCRIPT = json.loads((ROOT / 'tutorial/live-la-final-script.json').read_text(encoding='utf-8'))
TTS = ROOT / 'work/live-la-tts'
EDIT = ROOT / 'work/live-la-edit'
EDIT.mkdir(parents=True, exist_ok=True)
OUT = ROOT / 'tutorial'
CUT = 815.0
PACE = 1.5
DURATION = CUT * PACE


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def audio_duration(path):
    with wave.open(str(path), 'rb') as recording:
        return recording.getnframes() / recording.getframerate()


def clock(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f'{hours:02d}:{minutes:02d}:{secs:06.3f}'.replace('.', ',')


chapters = []
captions = ['WEBVTT', '']
audio_inputs = []
filters = []
mix_inputs = []
for index, chapter in enumerate(SCRIPT):
    start = chapter['source_start'] * PACE
    path = TTS / f"{chapter['id']}.wav"
    length = audio_duration(path)
    if index + 1 < len(SCRIPT):
        assert start + length < SCRIPT[index + 1]['source_start'] * PACE, chapter['id']
    assert start + length <= DURATION, chapter['id']
    chapters.append({'title': chapter['title'], 'start': round(start, 2)})
    audio_inputs += ['-i', str(path)]
    filters.append(f'[{index}:a]aresample=24000,adelay={round(start * 1000)}:all=1[a{index}]')
    mix_inputs.append(f'[a{index}]')
    sentences = re.split(r'(?<=[.!?])\s+', chapter['narration'].strip())
    weights = [max(1, len(sentence.split())) for sentence in sentences]
    cursor = start
    for sentence, weight in zip(sentences, weights):
        end = cursor + length * weight / sum(weights)
        captions.extend([f'{clock(cursor)} --> {clock(end)}', sentence, ''])
        cursor = end

(OUT / 'la-session-chapters.json').write_text(json.dumps(chapters, indent=2) + '\n', encoding='utf-8')
(OUT / 'la-session-captions.vtt').write_text('\n'.join(captions), encoding='utf-8')

slow = EDIT / 'slowed.mp4'
run('ffmpeg', '-y', '-v', 'error', '-t', str(CUT), '-i', str(CAPTURE),
    '-vf', f'setpts={PACE}*(PTS-STARTPTS),fps=6,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '32', '-an',
    '-movflags', '+faststart', str(slow))

filters.append(''.join(mix_inputs) + f'amix=inputs={len(SCRIPT)}:duration=longest:normalize=0,apad,atrim=0:{DURATION}[narration]')
voice = EDIT / 'narration.m4a'
run('ffmpeg', '-y', '-v', 'error', *audio_inputs,
    '-filter_complex', ';'.join(filters), '-map', '[narration]',
    '-c:a', 'aac', '-b:a', '64k', str(voice))

video = OUT / 'survive-drive-la-screen-session.mp4'
run('ffmpeg', '-y', '-v', 'error', '-i', str(slow), '-i', str(voice),
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy',
    '-movflags', '+faststart', str(video))
run('ffmpeg', '-y', '-v', 'error', '-ss', '720', '-i', str(CAPTURE),
    '-frames:v', '1', '-vf', 'scale=1280:720', str(OUT / 'la-session-poster.png'))
print(json.dumps({'duration_seconds': DURATION, 'bytes': video.stat().st_size,
                  'chapters': len(chapters), 'output': str(video)}, indent=2))
