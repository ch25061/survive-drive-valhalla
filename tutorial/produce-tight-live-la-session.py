"""Cut waiting from the original live capture and retime its existing voiceover."""
import concurrent.futures
import json
import math
import re
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAPTURE = ROOT.parent.parent / 'work/la-fresh-live-capture.mp4'
OUT = ROOT / 'tutorial'
EDIT = ROOT / 'work/tight-live-la-edit'
EDIT.mkdir(parents=True, exist_ok=True)
SCRIPT = json.loads((OUT / 'live-la-edited-script.json').read_text(encoding='utf-8'))
# Ranges preserve source order within and between chapters. Idle time between
# ranges is removed; actions keep their original speed and the last view remains
# visible for the explanation, followed by a brief reading pause.
RANGES = [
    [(0, 10), (20, 28), (39, 55)],
    [(58, 69), (108, 118)],
    [(175, 189)],
    [(178, 186), (204, 225)],
    [(320, 335)],
    [(258, 270), (310, 320), (337, 354)],
    [(355, 367), (406, 428)],
    [(468, 482), (498, 525)],
    [(530, 542), (561, 580), (586, 598)],
    [(600, 608), (632, 646), (657, 672)],
    [(675, 689), (694, 710)],
    [(710, 722), (748, 758), (797, 808)],
]


def run(args):
    subprocess.run(args, cwd=ROOT, check=True)


def duration(path):
    with wave.open(str(path), 'rb') as wav:
        return wav.getnframes() / wav.getframerate()


def clock(seconds):
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    secs, milliseconds = divmod(milliseconds, 1000)
    return f'{hours:02}:{minutes:02}:{secs:02}.{milliseconds:03}'


def render(item):
    index, chapter, ranges = item
    wav = ROOT / 'work/edited-live-la-tts' / f"{chapter['id']}.wav"
    speech = duration(wav)
    length = math.ceil(max(speech + 5, sum(end - start for start, end in ranges)))
    source_length = sum(end - start for start, end in ranges)
    args = ['ffmpeg', '-y', '-v', 'error']
    for start, end in ranges:
        args += ['-ss', str(start), '-t', str(end - start), '-i', str(CAPTURE)]
    args += ['-i', str(wav)]
    # Prescreening discusses the evidence on the route cards. Frame those cards
    # and the route map from the original pre-lookup footage, omitting the
    # selection controls above them. Keep the chapter and narration timing.
    framing = 'crop=1320:742:566:254,scale=1920:1080,' if chapter['id'] == 'round0' else ''
    if chapter['id'] == 'gates':
        framing = 'crop=416:602:48:60,scale=-2:980,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xf0f4f8,'
    filters = [f'[{i}:v]{framing}setpts=PTS-STARTPTS[v{i}]' for i in range(len(ranges))]
    filters.append(''.join(f'[v{i}]' for i in range(len(ranges))) +
                   f'concat=n={len(ranges)}:v=1:a=0,'
                   f'fps=12,format=yuv420p,tpad=stop_mode=clone:stop_duration={length},'
                   f'trim=duration={length}[picture]')
    filters.append(f'[{len(ranges)}:a]adelay=750:all=1,apad,atrim=duration={length}[voice]')
    target = EDIT / f'{index:02}-{chapter["id"]}.mp4'
    args += ['-filter_complex', ';'.join(filters), '-map', '[picture]', '-map', '[voice]',
             '-t', str(length), '-c:v', 'libx264', '-preset', 'fast', '-crf', '25',
             '-threads', '2', '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', str(target)]
    run(args)
    return {'id': chapter['id'], 'title': chapter['title'], 'length': length,
            'speech': speech, 'source_ranges': ranges, 'file': str(target)}


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    segments = list(pool.map(render, [(i, c, r) for i, (c, r) in enumerate(zip(SCRIPT, RANGES))]))

chapters, captions = [], ['WEBVTT', '']
cursor = 0
for chapter, segment in zip(SCRIPT, segments):
    chapters.append({'title': chapter['title'], 'start': cursor})
    segment['start'] = cursor
    speech_start = cursor + .75
    sentences = re.split(r'(?<=[.!?])\s+', chapter['narration'].strip())
    weights = [len(sentence.split()) for sentence in sentences]
    for sentence, weight in zip(sentences, weights):
        end = speech_start + segment['speech'] * weight / sum(weights)
        captions += [f'{clock(speech_start)} --> {clock(end)}', sentence, '']
        speech_start = end
    cursor += segment['length']

concat = EDIT / 'clips.ffconcat'
concat.write_text('ffconcat version 1.0\n' + ''.join(
    f"file '{Path(s['file']).as_posix()}'\n" for s in segments), encoding='utf-8')
video = OUT / 'survive-drive-la-screen-session.mp4'
run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat),
     '-c', 'copy', '-movflags', '+faststart', str(video)])
(OUT / 'la-session-chapters.json').write_text(json.dumps(chapters, indent=2) + '\n', encoding='utf-8')
(OUT / 'la-session-captions.vtt').write_text('\n'.join(captions), encoding='utf-8')
report = {'duration_seconds': cursor, 'narration_seconds': sum(s['speech'] for s in segments),
          'longest_between_chapter_silence_seconds': max(s['length']-s['speech'] for s in segments),
          'old_duration_seconds': 1222.5, 'segments': segments}
(EDIT / 'edit-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'segments'}))
