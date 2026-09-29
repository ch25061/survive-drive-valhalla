"""Create a captioned, illustrated walkthrough of the actual SD decision sequence.

The Los Angeles trip, route lines, candidate values, and cost numbers are
illustrative training data. The film never represents them as provider results.
"""
import json
import pathlib
import subprocess
import sys
import wave
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT=pathlib.Path(__file__).resolve().parent.parent
WORK=ROOT/'work'
OUT=ROOT/'tutorial'
FRAMES=WORK/'la-frames'
FRAMES.mkdir(parents=True,exist_ok=True)

SCENES=[
  dict(chapter='The trip',title='A long trip across greater LA',step='TRIP',points=['Santa Clarita to Long Beach','Set faster or balanced routing','Review highways and tolls'],narration='Let us compare a longer trip across the Los Angeles area, from Santa Clarita to Long Beach. In Set the trip, place both endpoints and review Valhalla preferences for highways, tolls, and route style. This is an illustrated training scenario; the route lines and property values shown here are examples, not live results.'),
  dict(chapter='Escape Gates',title='Explore both ends of the trip',step='GATES',points=['Start and destination gates','Include each no-gate case','Four gates each: 25 pairings'],narration='Next, review Escape Gates near both ends. They suggest different ways out of Santa Clarita and into Long Beach. If you keep four gates at each end, the no-gate choices make five times five, or twenty-five start and destination pairings. The app prepares the full cross product, not just matching gate numbers.'),
  dict(chapter='Route search',title='Review the Valhalla batch',step='SEARCH',points=['Check the exact request count','Route search spends no AVM credits','Returned candidates can overlap'],narration='Before routing, check the batch and its request limit. Valhalla returns road routes; some pairings may converge on the same corridor. The number of returned candidates can differ from the number of requests. Route discovery does not use RentCast A V M credits.'),
  dict(chapter='Round 0',title='Screen with saved evidence first',step='ROUND 0',points=['Map non-highway cells','Reuse known AVM values','Protect under 20% coverage'],narration='After routes arrive, evaluate the candidate pool. Round zero reuses saved A V M evidence before any new paid lookup. The default cull is thirty-five percent of the nominal pool. Routes with under twenty percent known coverage are protected in this first screen, because too little is known to reject them confidently. Highway runs and attached ramps are outside the A V M comparison.'),
  dict(chapter='Ranking',title='Read coverage before rank',step='RANK',points=['Lower known Red share ranks higher','Coverage shows uncertainty','Weighted PPSQFT breaks Red ties'],narration='Now read the ranking with its coverage. A route with a low known Red share can still have many unknown cells. When Red shares are equal, higher weighted price per square foot breaks the tie. In this demonstration, every percentage and property value on screen is illustrative, so use the pattern of reasoning rather than the numbers.'),
  dict(chapter='Inclusion',title='Choose who gets more evidence',step='INCLUDE',points=['INCLUDED routes enter One Round','EXCLUDED routes stay visible','Change either selection'],narration='INCLUDED means eligible for the next evidence round. EXCLUDED candidates remain in the ranked pool, and can return after new evidence changes the order. You can manually include or exclude routes before preparing another round. Every change updates the proposed A V M cost.'),
  dict(chapter='Exact cost',title='Count new lookups before Run',step='COST',points=['Start at 5 per INCLUDED route','Deduplicate shared cells','Example: 6 calls = 6 credits'],narration='Set the new lookup count per included route, starting at five. Then select Calculate exact One Round lookups. S D checks the cache and removes cells shared across routes before showing the new call count. For example, six unique new calls would be six credits, or six cents at the current displayed rate. That example is not a quote for this trip. Run remains a separate action.'),
  dict(chapter='Rerank',title='Let new evidence change the pool',step='RERANK',points=['Inspect the completed round','Set the next cutoff, default 35%','Previously excluded routes may return'],narration='After a completed One Round, the app reranks the full candidate pool. The next cutoff deactivates the chosen share of the previous nominal quota, with thirty-five percent as the current default. The best candidates fill the remaining slots, including routes excluded earlier if new evidence promotes them. You can continue one priced round at a time.'),
  dict(chapter='Decide',title='Inspect the route, then choose',step='DECIDE',points=['Compare route time and evidence','Inspect map cells and Street View','Export your decision'],narration='Finally, inspect a candidate on the map. The colored honeycomb represents estimated property values, not a safety score. Check the dates of any Street View imagery and keep your own observations separate. Compare travel time, known coverage, unknown areas, and your priorities. Choose a route and export the session if you want a record. You make the decision.'),
]

def font(size,bold=False):
    return ImageFont.truetype(str(pathlib.Path(r'C:\Windows\Fonts')/('segoeuib.ttf' if bold else 'segoeui.ttf')),size)

def wrap(draw,text,width,face):
    lines=[];line=''
    for word in text.split():
        candidate=(line+' '+word).strip()
        if line and draw.textbbox((0,0),candidate,font=face)[2]>width:
            lines.append(line);line=word
        else:line=candidate
    if line:lines.append(line)
    return lines

def label(draw,xy,text,size=20,color='#142238',bold=False):
    draw.text(xy,text,font=font(size,bold),fill=color)

def panel(draw,box,fill='#ffffff',line='#c8d6e7',radius=15):
    draw.rounded_rectangle(box,radius=radius,fill=fill,outline=line,width=2)

def pill(draw,box,text,fill='#e6f5ff',color='#164362',size=16):
    draw.rounded_rectangle(box,radius=12,fill=fill)
    label(draw,(box[0]+12,box[1]+6),text,size,color,True)

def map_art(draw,mode):
    box=(511,120,1222,613);panel(draw,box,'#eef3ee','#adc4b4')
    # Schematic topology, deliberately not a road map.
    for x in [560,640,720,800,880,960,1040,1120,1190]:draw.line((x,125,x-48,610),fill='#d8e1d9',width=2)
    for y in [160,225,290,355,420,485,550]:draw.line((516,y,1217,y+20),fill='#d8e1d9',width=2)
    draw.polygon([(1130,120),(1221,120),(1221,612),(1100,612),(1120,480),(1140,350)],fill='#b5dbe8')
    routes=[[(589,171),(620,226),(663,272),(717,312),(768,354),(808,401),(841,459),(910,520),(980,563)],[(589,171),(646,235),(730,257),(808,319),(892,353),(930,426),(952,494),(980,563)],[(589,171),(555,240),(573,320),(645,380),(704,415),(811,444),(898,490),(980,563)]]
    colors=['#008ed0','#20a477','#da8336']
    for route,color in zip(routes,colors):draw.line(route,fill='white',width=12,joint='curve');draw.line(route,fill=color,width=7,joint='curve')
    for x,y,name in [(589,171,'Santa Clarita'),(760,352,'Los Angeles'),(980,563,'Long Beach')]:
        draw.ellipse((x-7,y-7,x+7,y+7),fill='#142238',outline='white',width=2);label(draw,(x+13,y-13),name,17,'#152c3d',True)
    pill(draw,(1062,134,1201,171),'SCHEMATIC','#fff','#325068',14)
    if mode in ('ROUND 0','RANK','INCLUDE','COST','RERANK','DECIDE'):
        for x,y,col in [(715,314,'#ea715e'),(750,350,'#f1bf55'),(807,405,'#82c6aa'),(844,461,'#a7d8bd'),(909,521,'#ee8570'),(646,234,'#a6d6ba'),(920,429,'#f4ce71')]:
            draw.regular_polygon((x,y,18),6,rotation=30,fill=col,outline='#f9ffff',width=2)
        pill(draw,(526,570,970,602),'ILLUSTRATIVE AVM CELLS · NOT LIVE RESULTS','#fff','#5a334e',13)

def app_capture(im,draw,mode):
    panel(draw,(511,120,1222,613),'#ffffff','#adc0d4')
    captures=OUT/'captures'
    def paste(source,crop,target):
        part=Image.open(captures/source).convert('RGB').crop(crop)
        width,height=target[2]-target[0],target[3]-target[1]
        if source=='map.png':part=ImageOps.fit(part,(width,height),method=Image.Resampling.LANCZOS,centering=(.5,.2))
        else:part=ImageOps.contain(part,(width,height),method=Image.Resampling.LANCZOS)
        im.paste(part,(target[0]+(width-part.width)//2,target[1]+(height-part.height)//2))
    if mode in ('TRIP','GATES','ROUND 0'):
        source={'TRIP':'trip.png','GATES':'gates.png','ROUND 0':'round0.png'}[mode]
        crop={'TRIP':(45,0,405,705),'GATES':(45,0,405,540),'ROUND 0':(55,0,392,560)}[mode]
        paste(source,crop,(521,130,787,602))
        paste('map.png',(443,0,1468,700),(795,130,1212,602))
    else:
        paste('rerank.png',(452,92,1450,630),(521,130,1212,602))
    pill(draw,(991,136,1197,168),'ACTUAL APP SCREEN','#ffffff','#245b75',13)

def demo_ui(draw,mode):
    box=(511,120,1222,613);panel(draw,box,'#f6f8fc','#adc0d4')
    panel(draw,(529,140,1204,190),'#ffffff');label(draw,(546,149),'Survive Drive  /  Santa Clarita  →  Long Beach',20,'#152c3d',True)
    if mode=='TRIP':
        rows=[('Start','Santa Clarita, CA'),('Destination','Long Beach, CA'),('Route style','Faster  •  Highway preference reviewed'),('Tolls','Avoid if practical')]
        for i,(a,b) in enumerate(rows):
            y=210+i*78;panel(draw,(530,y,1202,y+65));label(draw,(548,y+8),a,15,'#556982',True);label(draw,(548,y+30),b,19,'#193a56',True)
    elif mode=='GATES':
        label(draw,(535,208),'Start Escape Gates',22,'#25456a',True);label(draw,(850,208),'Destination Approach Gates',22,'#25456a',True)
        for i,(a,b) in enumerate(zip(['No gate','North corridor','West corridor','South corridor','East corridor'],['No gate','North approach','Harbor approach','Coast approach','East approach'])):
            y=251+i*55;panel(draw,(532,y,840,y+47));panel(draw,(850,y,1201,y+47));label(draw,(547,y+10),a,18);label(draw,(865,y+10),b,18)
        pill(draw,(760,535,1050,578),'5 × 5 = 25 pairings','#e8dcff','#5c35a0',19)
    elif mode=='SEARCH':
        label(draw,(547,215),'Valhalla route batch prepared',24,'#25456a',True)
        panel(draw,(544,263,1185,360),'#e8f4ff');label(draw,(566,282),'25 route requests maximum',25,'#164362',True);label(draw,(566,324),'0 AVM lookup credits used by route search',17,'#325068')
        pill(draw,(548,390,861,443),'Search routes with Valhalla','#008b45','#fff',17)
        label(draw,(548,476),'Returned candidates may merge onto shared corridors.',18,'#536981')
    elif mode=='ROUND 0':
        label(draw,(546,213),'Round 0  ·  known coverage only',24,'#432179',True)
        panel(draw,(544,264,1186,424),'#f4edff','#8747cd');label(draw,(565,282),'35% nominal cull',27,'#432179',True)
        label(draw,(565,329),'Under 20% coverage → protected',19,'#432179')
        label(draw,(565,368),'No new paid AVM calls in this step',19,'#432179')
        pill(draw,(545,459,900,510),'Review cache-only ranking','#008b45','#fff',17)
    elif mode in ('RANK','INCLUDE','RERANK'):
        rows=[('1','West corridor','9%','92%','$462','INCLUDED'),('2','Central corridor','25%','67%','$375','EXCLUDED'),('3','East corridor','30%','83%','$363','EXCLUDED'),('4','Coast approach','50%','17%','$280','PROTECTED')]
        label(draw,(546,207),'Illustrative ranking',22,'#432179',True)
        label(draw,(556,246),'Rank    Candidate',16,'#52647b',True);label(draw,(921,246),'Red share   Coverage',16,'#52647b',True)
        for i,(rank,name,red,cov,weighted,status) in enumerate(rows):
            y=275+i*68;panel(draw,(541,y,1190,y+58),'#fff');label(draw,(556,y+7),f'{rank}    {name}',19,'#243a52',True);label(draw,(592,y+33),f'Weighted {weighted} / sq ft',13,'#596a7e');label(draw,(926,y+15),f'{red}       {cov}',17,'#243a52');pill(draw,(1073,y+12,1180,y+45),status,'#e4f7e9' if status=='INCLUDED' else '#f4ebfa','#1f6c39' if status=='INCLUDED' else '#5a3981',12)
        if mode=='INCLUDE':pill(draw,(555,560,1046,599),'Manual INCLUDE / EXCLUDE changes cost','#dff4fb','#125070',15)
        if mode=='RERANK':pill(draw,(555,560,1080,599),'Rerank full pool · next cull defaults to 35%','#dff4fb','#125070',15)
    elif mode=='COST':
        label(draw,(547,210),'One Round  ·  cost preview',24,'#432179',True)
        panel(draw,(545,260,1185,327));label(draw,(562,280),'New lookups per INCLUDED route     5',21,'#223a54',True)
        pill(draw,(545,352,1080,406),'Calculate exact One Round lookups','#008b45','#fff',18)
        panel(draw,(545,433,1185,511),'#e5f3fb','#3982ae');label(draw,(561,446),'EXAMPLE: 6 unique new lookups',21,'#125070',True);label(draw,(561,477),'6 credits × $0.01 = $0.06',18,'#125070')
        pill(draw,(545,535,750,581),'Run is separate','#ede5f8','#4b2d78',16)
    elif mode=='DECIDE':
        label(draw,(547,210),'Inspect route evidence',24,'#432179',True)
        for i,s in enumerate(['Travel time and route distance','Known coverage and missing cells','Red cells on non-highway segments','Street View date and your own notes']):
            y=260+i*57;panel(draw,(545,y,1185,y+47));label(draw,(565,y+10),s,19,'#223a54')
        pill(draw,(545,511,854,563),'Choose and export route','#008b45','#fff',17)

def slide(scene,index):
    im=Image.new('RGB',(1280,720),'#122033');d=ImageDraw.Draw(im)
    label(d,(47,29),'SURVIVE DRIVE  /  LOS ANGELES WALKTHROUGH',19,'#ffe36d',True)
    d.line((48,71,1230,71),fill='#4c6782',width=2)
    pill(d,(48,92,337,127),'REAL UI · DEMO EVIDENCE','#6c42a9','#fff',14)
    y=157
    for ln in wrap(d,scene['title'],402,font(39,True)):
        label(d,(48,y),ln,39,'white',True);y+=50
    y+=22
    for point in scene['points']:
        d.ellipse((51,y+11,62,y+22),fill='#55bdff')
        for ln in wrap(d,point,390,font(24)):
            label(d,(79,y),ln,24,'#dbe8f7');y+=34
        y+=20
    if scene['step'] in ('TRIP','GATES','ROUND 0','COST'):app_capture(im,d,scene['step'])
    elif scene['step']=='DECIDE':map_art(d,scene['step'])
    else:demo_ui(d,scene['step'])
    label(d,(49,643),'DEMO ROUTES AND AVM VALUES ARE ILLUSTRATIVE · NO PROVIDER CALLS',16,'#ffe36d',True)
    label(d,(49,674),f'{index:02} / 09  ·  {scene["chapter"].upper()}',18,'#a7bfdb',True)
    d.rounded_rectangle((511,673,1223,683),radius=5,fill='#30435c')
    d.rounded_rectangle((511,673,511+int(712*index/len(SCENES)),683),radius=5,fill='#55bdff')
    return im

def stamp(s):
    n=round(s*1000);h,n=divmod(n,3600000);m,n=divmod(n,60000);sec,ms=divmod(n,1000)
    return f'{h:02}:{m:02}:{sec:02}.{ms:03}'

def main():
    if '--scripts-only' in sys.argv:
        for i,scene in enumerate(SCENES,1):(WORK/f'la-voice-{i:02}.txt').write_text(scene['narration'],encoding='utf8')
        print('Prepared nine narration scripts.');return
    rendered=[];wav_files=[]
    for i,scene in enumerate(SCENES,1):
        frame=FRAMES/f'scene-{i:02}.png';slide(scene,i).save(frame,optimize=True)
        source=WORK/'la-tts'/f'narration-{i:02}.wav'
        if not source.exists():raise FileNotFoundError(source)
        pcm=WORK/'la-tts'/f'narration-{i:02}-pcm.wav'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-ar','24000','-ac','1','-c:a','pcm_s16le',str(pcm)],check=True)
        with wave.open(str(pcm),'rb') as w:duration=w.getnframes()/w.getframerate()+0.7
        rendered.append((scene,frame,duration));wav_files.append(pcm)
    full=WORK/'la-narration.wav'
    with wave.open(str(wav_files[0]),'rb') as w:params=w.getparams()
    with wave.open(str(full),'wb') as out:
        out.setparams(params)
        for file in wav_files:
            with wave.open(str(file),'rb') as source:out.writeframes(source.readframes(source.getnframes()))
            out.writeframes(b'\0'*int(params.framerate*.7)*params.nchannels*params.sampwidth)
    concat=['ffconcat version 1.0'];cues=['WEBVTT',''];chapters=[';FFMETADATA1'];chapter_data=[];story=['# Los Angeles long-route workflow','', 'Illustrated training scenario. Trip lines, candidate percentages, and AVM values are examples; no provider requests were sent for this video.',''];elapsed=0
    for i,(scene,frame,duration) in enumerate(rendered,1):
        concat.extend([f"file '{frame.as_posix()}'",f'duration {duration:.3f}'])
        words=scene['narration'].split();chunks=[]
        for word in words:
            if not chunks or len(chunks[-1])+len(word)+1>62:chunks.append(word)
            else:chunks[-1]+=' '+word
        total=len(words);cue_start=elapsed;end=elapsed+duration-.7
        for j,chunk in enumerate(chunks,1):
            cue_end=end if j==len(chunks) else cue_start+(end-elapsed)*len(chunk.split())/total
            cues.extend([f'{i}.{j}',f'{stamp(cue_start)} --> {stamp(cue_end)}',chunk,'']);cue_start=cue_end
        chapters.extend(['[CHAPTER]','TIMEBASE=1/1000',f'START={round(elapsed*1000)}',f'END={round((elapsed+duration)*1000)}',f'title={scene["chapter"]}'])
        chapter_data.append(dict(title=scene['chapter'],start=round(elapsed,2),description=scene['points'][0]))
        story.extend([f'## {stamp(elapsed)} — {scene["title"]}','',f'On screen: {"; ".join(scene["points"])}.','',f'Narration: {scene["narration"]}','']);elapsed+=duration
    concat.append(f"file '{rendered[-1][1].as_posix()}'")
    (WORK/'la-frames.ffconcat').write_text('\n'.join(concat)+'\n',encoding='utf8')
    (WORK/'la-chapters.ffmeta').write_text('\n'.join(chapters)+'\n',encoding='utf8')
    (OUT/'la-captions.vtt').write_text('\n'.join(cues),encoding='utf8')
    (OUT/'la-chapters.json').write_text(json.dumps(chapter_data,indent=2)+'\n',encoding='utf8')
    (OUT/'la-storyboard.md').write_text('\n'.join(story),encoding='utf8')
    Image.open(rendered[0][1]).save(OUT/'la-poster.png',optimize=True)
    video=OUT/'survive-drive-la-workflow.mp4'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(WORK/'la-frames.ffconcat'),'-i',str(full),'-i',str(WORK/'la-chapters.ffmeta'),'-map','0:v:0','-map','1:a:0','-map_metadata','2','-r','12','-c:v','libx264','-preset','medium','-crf','32','-pix_fmt','yuv420p','-c:a','aac','-b:a','40k','-movflags','+faststart','-t',f'{elapsed:.3f}',str(video)],check=True)
    print(json.dumps(dict(video=str(video),seconds=round(elapsed,1),bytes=video.stat().st_size,chapters=len(chapter_data))))

if __name__=='__main__':main()
