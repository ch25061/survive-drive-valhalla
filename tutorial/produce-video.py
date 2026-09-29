"""Produce the SD tutorial from verified local-preview screenshots."""
import json
import math
import pathlib
import subprocess
import sys
import textwrap
import wave

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = pathlib.Path(__file__).resolve().parent.parent
WORK = ROOT / "work"
OUT = ROOT / "tutorial"
OUT.mkdir(exist_ok=True)
FRAMES = WORK / "tutorial-frames"
FRAMES.mkdir(exist_ok=True)

SCENES = [
    {
        "title": "Your trip. Your evidence. Your choice.",
        "chapter": "Start here",
        "screen": "overview",
        "crop": [0, 0, 1500, 900],
        "points": ["Compare candidate routes", "Understand what is known", "Make the final decision"],
        "narration": "Welcome to Survive Drive. Set a trip, compare candidate routes, inspect the evidence, and choose for yourself. The app organizes information; it does not declare a route safe. This tour shows the controls and why they exist.",
    },
    {
        "title": "Why so many controls?",
        "chapter": "AVM economy",
        "screen": "ranking",
        "crop": [0, 0, 1450, 720],
        "points": ["One cell can appear on many routes", "Cached values cost no new lookup", "Exact plans prevent surprise calls"],
        "narration": "Most of this machinery exists to keep AVM lookups economical. A cell can be shared by several routes, and a saved value can be reused without a new RentCast request. At one cent per new lookup, ten million uncached lookups would total one hundred thousand dollars. A nationwide prefill could reach or exceed that scale, depending on grid density. SD focuses on the cells relevant to your trip instead.",
    },
    {
        "title": "Set the trip and road preferences",
        "chapter": "Trip setup",
        "screen": "trip",
        "crop": [45, 0, 490, 900],
        "points": ["Place S and D on the map", "Choose route preferences", "No live traffic in this version"],
        "narration": "Enter coordinates or place the start and destination on the map. You can name each point, choose faster travel or a balance of time and distance, and set road preferences such as highways and tolls. These preferences guide Valhalla; avoid does not guarantee that a road type will disappear. This version does not use live traffic.",
    },
    {
        "title": "Review Escape Gates",
        "chapter": "Escape Gates",
        "screen": "gates",
        "crop": [25, 100, 440, 900],
        "points": ["Review both ends", "Choose ring and gate settings", "GO finds road suggestions"],
        "narration": "Escape Gates offer possible approaches near both ends of the trip. Adjust the ring and gate settings, then select GO to find road suggestions. Review the gates before searching. With sixteen gates at each end, including the no-gate cases, the full cross product is seventeen by seventeen, or two hundred eighty-nine Valhalla requests. The exact batch is shown before the search.",
    },
    {
        "title": "See the route request budget",
        "chapter": "Valhalla search",
        "screen": "search",
        "crop": [35, 0, 470, 900],
        "points": ["Prepared batch is explicit", "Local Valhalla supplies routes", "Failures stop for review"],
        "narration": "The route budget shows the prepared Valhalla requests and provider-attempt count. When the local Valhalla service is ready, the prepared batch starts automatically within that limit. A failed request stops the workflow for review. There is no automatic Valhalla retry. The route search does not spend AVM credits.",
    },
    {
        "title": "Round 0 uses known evidence",
        "chapter": "Round 0",
        "screen": "evaluate",
        "crop": [30, 0, 470, 760],
        "points": ["Map eligible route cells", "Check the shared AVM cache", "Cull before buying new evidence"],
        "narration": "Evaluate first maps eligible route cells and checks saved AVM values. Round zero ranks with that known evidence before asking for new paid lookups. Its default cutoff deactivates thirty-five percent of the nominal candidates, while routes with less than twenty percent known coverage are protected. Unknown cells remain unknown; they are not treated as low values.",
    },
    {
        "title": "Read the ranking carefully",
        "chapter": "Ranking and coverage",
        "screen": "ranking",
        "crop": [0, 0, 1450, 720],
        "points": ["Coverage tells how much is known", "INCLUDED routes get future evidence", "EXCLUDED routes stay in the ranking"],
        "narration": "Each candidate shows its rank, known coverage, and unknown cells. INCLUDED means eligible for the next evidence round; EXCLUDED candidates remain visible and can return after reranking. The Red cutoff classifies known cells by price per square foot. This is a geographic value signal, not a measured safety rating. Highway runs and attached ramps are left out of AVM evaluation.",
    },
    {
        "title": "Price One Round before Run",
        "chapter": "Exact lookup cost",
        "screen": "round",
        "crop": [25, 0, 490, 760],
        "points": ["Set lookups per INCLUDED route", "Calculate exact unique cells", "Run is a separate choice"],
        "narration": "For more evidence, choose the number of new cells per INCLUDED route. SD checks the shared cache and removes duplicate cells across routes. Calculate exact One Round lookups to see the final new-call count before you select Run. Each new lookup is counted as one credit at one cent in the current cost display. Failed attempts count, and paid provider calls are not retried automatically.",
    },
    {
        "title": "Read the map as evidence",
        "chapter": "AVM map colors",
        "screen": "evaluate",
        "crop": [30, 0, 470, 780],
        "points": ["Red is below your PPSQFT cutoff", "Color range changes contrast", "Missing evidence stays unknown"],
        "narration": "Set the Red threshold for ranking and the upper map-color bound for visual contrast. Changing these settings reclassifies or recolors saved evidence without buying new values. Colored cells describe estimated property value around a route, not danger or safety. A missing AVM value still means unknown.",
    },
    {
        "title": "Inspect, then decide",
        "chapter": "Look around and choose",
        "screen": "inspect",
        "crop": [25, 0, 470, 900],
        "points": ["Open Street View from a map point", "Check image dates", "Record your own observations"],
        "narration": "Open Street View from a map point and check when the imagery was taken. Record what you notice separately from the AVM signal. Then compare route trade-offs and choose a candidate. Export the session or decision if you want a copy. You remain in control of the route and every new evidence round.",
    },
]


def font(size, bold=False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(pathlib.Path(r"C:\Windows\Fonts") / name), size)


def wrapped(text, max_width, draw, face):
    words = text.split()
    lines = []
    line = ""
    for word in words:
        trial = (line + " " + word).strip()
        if line and draw.textbbox((0, 0), trial, font=face)[2] > max_width:
            lines.append(line)
            line = word
        else:
            line = trial
    if line:
        lines.append(line)
    return lines


def slide(scene, number):
    canvas = Image.new("RGB", (1280, 720), "#121e30")
    draw = ImageDraw.Draw(canvas)
    draw.text((52, 34), "SURVIVE DRIVE  /  GETTING STARTED", font=font(20, True), fill="#ffe36d")
    draw.line((52, 76, 1228, 76), fill="#466079", width=2)
    title = scene["title"]
    title_face = font(38 if len(title) > 30 else 43, True)
    y = 118
    for line in wrapped(title, 410, draw, title_face):
        draw.text((52, y), line, font=title_face, fill="white")
        y += 54
    y += 28
    body_face = font(25)
    for point in scene["points"]:
        draw.ellipse((54, y + 12, 64, y + 22), fill="#55bdff")
        for line in wrapped(point, 390, draw, body_face):
            draw.text((78, y), line, font=body_face, fill="#d6e4f2")
            y += 36
        y += 18
    image = Image.open(WORK / f"tutorial-{scene['screen']}.png").convert("RGB")
    image = image.crop(tuple(scene["crop"]))
    area = (507, 106, 1228, 621)
    aw, ah = area[2] - area[0], area[3] - area[1]
    image.thumbnail((aw - 16, ah - 16), Image.Resampling.LANCZOS)
    draw.rounded_rectangle(area, radius=15, fill="white", outline="#a9c0d4", width=3)
    x = area[0] + (aw - image.width) // 2
    yi = area[1] + (ah - image.height) // 2
    canvas.paste(image, (x, yi))
    draw.text((52, 661), f"{number:02d} / {len(SCENES):02d}   {scene['chapter'].upper()}", font=font(20, True), fill="#9cb9d4")
    draw.rounded_rectangle((508, 666, 1228, 677), radius=5, fill="#30435c")
    draw.rounded_rectangle((508, 666, 508 + int(720 * number / len(SCENES)), 677), radius=5, fill="#55bdff")
    return canvas


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    hours, rem = divmod(milliseconds, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02}.{ms:03}"


def main():
    if "--scripts-only" in sys.argv:
        for index, scene in enumerate(SCENES, 1):
            (WORK / f"tutorial-voice-{index:02}.txt").write_text(scene["narration"], encoding="utf-8")
        print("Prepared narration scripts for the ten tutorial scenes.")
        return
    rendered = []
    wav_files = []
    for index, scene in enumerate(SCENES, 1):
        frame = FRAMES / f"scene-{index:02}.png"
        slide(scene, index).save(frame, optimize=True)
        words = WORK / f"tutorial-voice-{index:02}.txt"
        words.write_text(scene["narration"], encoding="utf-8")
        source_audio = WORK / "tutorial-tts" / f"narration-{index:02}.wav"
        if not source_audio.exists():
            raise FileNotFoundError(f"Generate the natural narration before rendering: {source_audio}")
        audio = WORK / "tutorial-tts" / f"narration-{index:02}-pcm.wav"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source_audio), "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", str(audio)], check=True)
        with wave.open(str(audio), "rb") as wav:
            duration = wav.getnframes() / wav.getframerate()
        rendered.append((scene, frame, duration + 0.7))
        wav_files.append(audio)

    full_audio = WORK / "tutorial-narration.wav"
    with wave.open(str(wav_files[0]), "rb") as first:
        params = first.getparams()
    with wave.open(str(full_audio), "wb") as output:
        output.setparams(params)
        for audio in wav_files:
            with wave.open(str(audio), "rb") as source:
                if source.getparams()[:3] != params[:3]:
                    raise RuntimeError("Narration audio formats differ")
                output.writeframes(source.readframes(source.getnframes()))
            output.writeframes(b"\0" * int(params.framerate * 0.7) * params.nchannels * params.sampwidth)

    concat = WORK / "tutorial-frames.ffconcat"
    concat_lines = ["ffconcat version 1.0"]
    cues = ["WEBVTT", ""]
    chapters = [";FFMETADATA1"]
    storyboard = ["# Survive Drive tutorial storyboard", "", "First cut: real controls captured from a clean local preview. No provider requests were made for filming.", ""]
    elapsed = 0.0
    chapter_data = []
    for index, (scene, frame, duration) in enumerate(rendered, 1):
        concat_lines += [f"file '{frame.as_posix()}'", f"duration {duration:.3f}"]
        cue_end = elapsed + duration - 0.7
        # Short cues keep the map and controls visible while the narration plays.
        words = scene["narration"].split()
        chunks = []
        for word in words:
            if not chunks or len(chunks[-1]) + len(word) + 1 > 58:
                chunks.append(word)
            else:
                chunks[-1] += " " + word
        total_words = len(words)
        cue_start = elapsed
        for chunk_index, chunk in enumerate(chunks):
            chunk_words = len(chunk.split())
            chunk_end = cue_end if chunk_index == len(chunks) - 1 else cue_start + (cue_end - elapsed) * chunk_words / total_words
            cues += [f"{index}.{chunk_index + 1}", f"{timestamp(cue_start)} --> {timestamp(chunk_end)}", chunk, ""]
            cue_start = chunk_end
        chapters += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={round(elapsed*1000)}", f"END={round((elapsed+duration)*1000)}", f"title={scene['chapter']}"]
        storyboard += [f"## {timestamp(elapsed)} — {scene['title']}", "", f"Screen: `{scene['screen']}`. " + "; ".join(scene["points"]) + ".", "", f"Narration: {scene['narration']}", ""]
        chapter_data.append({"title": scene["chapter"], "start": round(elapsed, 2), "description": scene["points"][0]})
        elapsed += duration
    concat_lines.append(f"file '{rendered[-1][1].as_posix()}'")
    concat.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")
    (WORK / "tutorial-chapters.ffmeta").write_text("\n".join(chapters) + "\n", encoding="utf-8")
    (OUT / "captions.vtt").write_text("\n".join(cues), encoding="utf-8")
    (OUT / "storyboard.md").write_text("\n".join(storyboard), encoding="utf-8")
    (OUT / "chapters.json").write_text(json.dumps(chapter_data, indent=2) + "\n", encoding="utf-8")
    Image.open(rendered[0][1]).save(OUT / "poster.png", optimize=True)
    video = OUT / "survive-drive-getting-started.mp4"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-i", str(full_audio), "-i", str(WORK / "tutorial-chapters.ffmeta"), "-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "2", "-r", "12", "-c:v", "libx264", "-preset", "medium", "-crf", "32", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "40k", "-movflags", "+faststart", "-t", f"{elapsed:.3f}", str(video)],
        check=True,
    )
    print(json.dumps({"video": str(video), "seconds": round(elapsed, 1), "bytes": video.stat().st_size, "chapters": len(chapter_data)}))


if __name__ == "__main__":
    main()
