"""Edit captured app frames and narrated chapters into the LA training walkthrough."""
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = json.loads((ROOT / 'tutorial/la-session-script.json').read_text(encoding='utf-8'))
MANIFEST = json.loads((ROOT / 'work/la-session-frames/manifest.json').read_text(encoding='utf-8'))
FRAMES = ROOT / 'work/la-session-frames'
TTS = ROOT / 'work/la-session-tts'
OUT = ROOT / 'tutorial'
WORK = ROOT / 'work/la-session-edit'
WORK.mkdir(parents=True, exist_ok=True)


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def duration(path):
    p = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'default=noprint_wrappers=1:nokey=1', str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(p.stdout.strip())


def clock(seconds):
    hours = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f'{hours:02d}:{mins:02d}:{secs:06.3f}'.replace('.', ',')


def ffquote(path):
    return str(path.resolve()).replace('\\', '/').replace("'", "'\\''")


by_chapter = defaultdict(list)
for frame in MANIFEST:
    by_chapter[frame['chapter']].append(frame)

video_lines = ['ffconcat version 1.0']
audio_lines = []
chapters = []
captions = ['WEBVTT', '']
elapsed = 0.0
last_frame = None

for index, chapter in enumerate(SCRIPT, 1):
    audio = TTS / f'narration-{index:02d}.wav'
    length = duration(audio)
    chapter_start = elapsed
    chapters.append({
        'title': chapter['title'],
        'start': round(chapter_start, 2),
        'description': chapter['id'],
    })
    audio_lines.append(f"file '{ffquote(audio)}'")
    frames = by_chapter[chapter['id']]
    assert frames, chapter['id']
    weighted = [float(frame['duration']) for frame in frames]
    weight_sum = sum(weighted)
    current = 0.0
    for frame, weight in zip(frames, weighted):
        frame_path = FRAMES / frame['file']
        last_frame = frame_path
        share = length * weight / weight_sum
        video_lines.append(f"file '{ffquote(frame_path)}'")
        video_lines.append(f'duration {share:.6f}')
        current += share

    # Sentence captions are timed within each spoken chapter. They are intended
    # as readable captions, with the whole narration available in the script.
    sentences = re.split(r'(?<=[.!?])\s+', chapter['narration'].strip())
    sentences = [sentence for sentence in sentences if sentence]
    weights = [max(1, len(sentence.split())) for sentence in sentences]
    total_words = sum(weights)
    cursor = chapter_start
    for sentence, words in zip(sentences, weights):
        end = cursor + length * words / total_words
        captions.extend([f'{clock(cursor)} --> {clock(end)}', sentence, ''])
        cursor = end
    elapsed += length

video_lines.append(f"file '{ffquote(last_frame)}'")
(WORK / 'frames.ffconcat').write_text('\n'.join(video_lines) + '\n', encoding='utf-8')
(WORK / 'audio.ffconcat').write_text('ffconcat version 1.0\n' + '\n'.join(audio_lines) + '\n', encoding='utf-8')
(OUT / 'la-session-captions.vtt').write_text('\n'.join(captions), encoding='utf-8')
(OUT / 'la-session-chapters.json').write_text(json.dumps(chapters, indent=2) + '\n', encoding='utf-8')

poster = Image.open(FRAMES / MANIFEST[0]['file']).convert('RGB').resize((1280, 720))
draw = ImageDraw.Draw(poster)
draw.rounded_rectangle((70, 210, 1210, 520), radius=28, fill=(11, 31, 45), outline=(135, 60, 235), width=5)
font_path = 'C:/Windows/Fonts/segoeuib.ttf'
title_font = ImageFont.truetype(font_path, 52)
small_font = ImageFont.truetype(font_path, 25)
draw.text((105, 250), 'Survive Drive: a screen session', font=title_font, fill='white')
draw.text((108, 345), 'Los Angeles training example  •  12 chapters', font=small_font, fill=(210, 232, 243))
draw.text((108, 400), 'Illustrative route evidence · no paid lookup in this recording', font=small_font, fill=(255, 219, 146))
poster.save(OUT / 'la-session-poster.png', optimize=True)

run('ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(WORK / 'audio.ffconcat'),
    '-c:a', 'pcm_s16le', str(WORK / 'narration.wav'))
video_path = OUT / 'survive-drive-la-screen-session.mp4'
run('ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(WORK / 'frames.ffconcat'),
    '-i', str(WORK / 'narration.wav'), '-map', '0:v:0', '-map', '1:a:0',
    '-vf', 'scale=1280:720:flags=lanczos,format=yuv420p', '-r', '8',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '33', '-tune', 'stillimage',
    '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', '-shortest', str(video_path))
print(json.dumps({'seconds': round(duration(video_path), 2), 'bytes': video_path.stat().st_size,
                  'chapters': len(chapters), 'frames': len(MANIFEST)}, indent=2))
