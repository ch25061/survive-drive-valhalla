(()=>{
  const video=document.getElementById('la-session-tutorial-video');
  const list=document.getElementById('la-session-video-chapters');
  const error=document.getElementById('la-session-video-error');
  const duration=document.getElementById('la-session-video-duration');
  const clock=seconds=>{const total=Math.floor(seconds);return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`};
  fetch('/tutorial-la-session-chapters.json').then(response=>{if(!response.ok)throw Error('Chapters unavailable');return response.json()}).then(chapters=>{
    list.replaceChildren();
    for(const chapter of chapters){
      const li=document.createElement('li');
      const button=document.createElement('button');button.type='button';
      const name=document.createElement('span');name.textContent=chapter.title;
      const time=document.createElement('time');time.textContent=clock(chapter.start);
      button.append(name,time);
      button.addEventListener('click',()=>{video.currentTime=chapter.start;video.scrollIntoView({block:'center',behavior:'smooth'});video.play().catch(()=>{});});
      li.append(button);list.append(li);
    }
  }).catch(()=>{list.textContent='Chapter list unavailable; use the video controls or read the topics below.'});
  video.addEventListener('loadedmetadata',()=>{if(Number.isFinite(video.duration))duration.textContent=`${clock(video.duration)} · captions available`});
  video.addEventListener('error',()=>{error.hidden=false});
})();
