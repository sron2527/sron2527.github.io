import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const video = document.querySelector("#webcam");
const startBtn = document.querySelector("#startCamera");
const resetBtn = document.querySelector("#resetGame");
const cameraStatus = document.querySelector("#cameraStatus");
const playfield = document.querySelector("#playfield");
const cursor = document.querySelector("#handCursor");
const gestureState = document.querySelector("#gestureState");
const feedback = document.querySelector("#feedback");
const scoreEl = document.querySelector("#score");
const progressText = document.querySelector("#progressText");
const progressBar = document.querySelector("#progressBar");
const cameraDot = document.querySelector(".camera-caption .live-dot");
const timerEl = document.querySelector("#timer");
const timerCard = document.querySelector(".timer-card");
const soundToggle = document.querySelector("#soundToggle");
const resultPanel = document.querySelector("#resultPanel");
const resultIcon = document.querySelector("#resultIcon");
const resultTitle = document.querySelector("#resultTitle");
const resultDetail = document.querySelector("#resultDetail");
const finalScore = document.querySelector("#finalScore");
const playAgain = document.querySelector("#playAgain");

const names = {cpu:"CPU",ram:"RAM",ssd:"SSD",gpu:"GPU"};
const ROUND_SECONDS = 15;
let landmarker, stream, running=false, wasPinching=false, held=null, score=0;
let missionActive=false, missionEnd=0, timerFrame=0, lastShownSecond=ROUND_SECONDS;
let soundOn=true, audioContext=null;
const placed = new Set();

function say(message,type=""){
  feedback.textContent=message;
  feedback.className="feedback "+type;
}
function audio(){
  if(!soundOn)return null;
  try{
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==="suspended") audioContext.resume();
    return audioContext;
  }catch{return null}
}
function tone(freq,duration=.12,wave="sine",volume=.055,delay=0){
  const ctx=audio(); if(!ctx)return;
  const start=ctx.currentTime+delay;
  const osc=ctx.createOscillator(), gain=ctx.createGain();
  osc.type=wave;osc.frequency.setValueAtTime(freq,start);
  gain.gain.setValueAtTime(.0001,start);
  gain.gain.exponentialRampToValueAtTime(volume,start+.012);
  gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(gain);gain.connect(ctx.destination);
  osc.start(start);osc.stop(start+duration+.02);
}
function playSound(kind){
  if(!soundOn)return;
  if(kind==="grab")tone(520,.07,"triangle",.035);
  if(kind==="correct"){tone(660,.12,"sine",.06);tone(880,.18,"sine",.055,.11)}
  if(kind==="wrong"){tone(190,.2,"sawtooth",.045);tone(140,.22,"sawtooth",.035,.16)}
  if(kind==="win"){[523,659,784,1047].forEach((n,i)=>tone(n,.28,"triangle",.06,i*.13))}
  if(kind==="timeout"){tone(330,.2,"triangle",.05);tone(220,.35,"triangle",.05,.22)}
}
function updateProgress(){
  const count=placed.size;
  progressText.textContent=`ติดตั้งแล้ว ${count} / 4`;
  progressBar.style.width=(count/4*100)+"%";
  scoreEl.textContent=score;
}
function showTimer(seconds){
  const value=Math.max(0,seconds);
  timerEl.textContent=String(value).padStart(2,"0");
  timerCard.classList.toggle("urgent",value<=5);
}
function startMission(){
  cancelAnimationFrame(timerFrame);
  missionActive=true;
  missionEnd=performance.now()+ROUND_SECONDS*1000;
  lastShownSecond=ROUND_SECONDS;
  resultPanel.hidden=true;
  showTimer(ROUND_SECONDS);
  say("เริ่มแล้ว! มีเวลา 15 วินาที รีบติดตั้งอุปกรณ์ทั้ง 4 ชิ้นให้ถูกต้อง");
  timerLoop();
}
function timerLoop(){
  if(!missionActive)return;
  const remaining=Math.max(0,(missionEnd-performance.now())/1000);
  const seconds=Math.ceil(remaining);
  if(seconds!==lastShownSecond){
    lastShownSecond=seconds;
    showTimer(seconds);
    if(seconds<=5&&seconds>0)tone(740,.045,"square",.018);
  }
  if(remaining<=0){
    showTimer(0);
    finishMission(false);
    return;
  }
  timerFrame=requestAnimationFrame(timerLoop);
}
function finishMission(won){
  if(!missionActive)return;
  missionActive=false;
  cancelAnimationFrame(timerFrame);
  const remaining=Math.max(0,Math.ceil((missionEnd-performance.now())/1000));
  if(won){
    const bonus=remaining*10;
    score+=bonus;
    updateProgress();
    resultIcon.textContent="🏆";
    resultTitle.textContent="ภารกิจสำเร็จ!";
    resultDetail.textContent=`ติดตั้งครบ 4 ชิ้น ได้โบนัสเวลาอีก ${bonus} คะแนน`;
    playSound("win");
    say("ยอดเยี่ยม! ประกอบอุปกรณ์ครบก่อนหมดเวลา 🎉","good");
  }else{
    resultIcon.textContent="⏰";
    resultTitle.textContent="หมดเวลา!";
    resultDetail.textContent=`ติดตั้งถูกต้อง ${placed.size} จาก 4 ชิ้น ลองอีกครั้งเพื่อทำคะแนนให้ดีกว่าเดิม`;
    playSound("timeout");
    say("หมดเวลาแล้ว! กดเล่นอีกครั้งเพื่อเริ่มภารกิจใหม่","bad");
  }
  finalScore.textContent=score;
  resultPanel.hidden=false;
  gestureState.innerHTML='<span class="gesture-icon">🏁</span><span>จบภารกิจแล้ว</span>';
}
function pointIn(el,x,y){
  const r=el.getBoundingClientRect();
  return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
}
function getScreenPoint(lm){
  const r=playfield.getBoundingClientRect();
  return {x:r.left+(1-lm.x)*r.width,y:r.top+lm.y*r.height,localX:(1-lm.x)*r.width,localY:lm.y*r.height};
}
function beginGrab(x,y){
  if(!missionActive)return;
  const target=document.elementFromPoint(x,y)?.closest(".part-card");
  if(!target||target.classList.contains("placed"))return;
  held=target;
  held.classList.add("dragging","selected");
  held.style.left=(x-75)+"px";
  held.style.top=(y-28)+"px";
  playSound("grab");
  gestureState.innerHTML='<span class="gesture-icon">🤏</span><span>กำลังหยิบ '+names[held.dataset.part]+'</span>';
  say("กำลังถือ "+names[held.dataset.part]+" — เล็งไปยังช่องติดตั้ง");
}
function moveGrab(x,y){
  if(!held)return;
  held.style.left=(x-75)+"px";
  held.style.top=(y-28)+"px";
  document.querySelectorAll(".slot").forEach(slot=>slot.classList.toggle("over",pointIn(slot,x,y)));
}
function endGrab(x,y){
  if(!held)return;
  const slot=document.elementFromPoint(x,y)?.closest(".slot");
  const part=held.dataset.part;
  held.classList.remove("dragging","selected");
  held.style.left="";held.style.top="";
  if(slot&&slot.dataset.slot===part&&!placed.has(part)){
    placed.add(part);score+=100;
    slot.classList.add("done");
    slot.querySelector(".slot-art").textContent=names[part]+" ✓";
    held.classList.add("placed");
    held.querySelector(".grab-hint").textContent="ติดตั้งแล้ว";
    playSound("correct");
    say("ถูกต้อง! ติดตั้ง "+names[part]+" สำเร็จ +100 คะแนน","good");
    updateProgress();
    if(placed.size===4)finishMission(true);
  }else if(slot){
    score=Math.max(0,score-10);
    playSound("wrong");
    say("วางผิดตำแหน่ง! -10 คะแนน ลองดูชื่อช่องบนเมนบอร์ดอีกครั้ง","bad");
    updateProgress();
    gestureState.innerHTML='<span class="gesture-icon">✋</span><span>ปล่อยอุปกรณ์แล้ว</span>';
  }else{
    say("ยังไม่ได้วางบนช่องติดตั้ง ลองหยิบใหม่อีกครั้ง");
    gestureState.innerHTML='<span class="gesture-icon">✋</span><span>พร้อมหยิบอุปกรณ์</span>';
  }
  held=null;
  document.querySelectorAll(".slot").forEach(s=>s.classList.remove("over"));
}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function loop(){
  if(!running)return;
  if(video.readyState>=2){
    const result=landmarker.detectForVideo(video,performance.now());
    const hand=result.landmarks?.[0];
    if(hand){
      const p=getScreenPoint(hand[8]);
      const pinching=distance(hand[4],hand[8])<.055;
      cursor.style.display="grid";
      cursor.style.left=p.localX+"px";
      cursor.style.top=p.localY+"px";
      cursor.classList.toggle("pinching",pinching);
      if(pinching&&!wasPinching)beginGrab(p.x,p.y);
      if(pinching&&held)moveGrab(p.x,p.y);
      if(!pinching&&wasPinching)endGrab(p.x,p.y);
      wasPinching=pinching;
      if(!held)gestureState.innerHTML=pinching?'<span class="gesture-icon">🤏</span><span>จีบนิ้วอยู่ — เล็งไปที่อุปกรณ์</span>':'<span class="gesture-icon">✋</span><span>พบมือแล้ว · จีบนิ้วเพื่อหยิบอุปกรณ์</span>';
    }else{
      cursor.style.display="none";
      if(held){held.classList.remove("dragging","selected");held.style.left="";held.style.top="";held=null;}
      wasPinching=false;
      gestureState.innerHTML='<span class="gesture-icon">👋</span><span>ยังไม่พบมือ — ยกมือให้อยู่ในกรอบกล้อง</span>';
    }
  }
  requestAnimationFrame(loop);
}
async function startCamera(){
  startBtn.disabled=true;startBtn.textContent="กำลังเปิดกล้อง...";
  audio();
  try{
    if(!stream){
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480}},audio:false});
      video.srcObject=stream;
      await video.play();
    }
    cameraStatus.textContent="กล้องทำงานอยู่";
    cameraDot.classList.add("on");
    if(!landmarker){
      say("กำลังโหลดระบบตรวจจับมือ...");
      const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
      try{
        landmarker=await HandLandmarker.createFromOptions(vision,{
          baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"GPU"},
          runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
        });
      }catch(gpuError){
        console.warn("GPU delegate unavailable; retrying with CPU",gpuError);
        landmarker=await HandLandmarker.createFromOptions(vision,{
          baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"},
          runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
        });
      }
    }
    if(!running){running=true;cursor.style.display="grid";loop();}
    startBtn.textContent="กล้องเปิดแล้ว";startBtn.disabled=false;
    if(!missionActive&&placed.size===0)startMission();
    else say("กล้องพร้อมแล้ว กดเริ่มใหม่เพื่อเริ่มจับเวลา 15 วินาที","good");
  }catch(error){
    console.error(error);
    cameraStatus.textContent="เปิดกล้องไม่สำเร็จ";
    startBtn.disabled=false;startBtn.textContent="ลองเปิดกล้องอีกครั้ง";
    say("เปิดกล้องไม่ได้: "+(error.name==="NotAllowedError"?"กรุณาอนุญาตให้เว็บไซต์ใช้กล้อง":error.message),"bad");
  }
}
function resetGame(){
  placed.clear();score=0;held=null;wasPinching=false;
  document.querySelectorAll(".slot").forEach(s=>{s.classList.remove("done","over");s.querySelector(".slot-art").textContent=s.dataset.slot.toUpperCase();});
  document.querySelectorAll(".part-card").forEach(c=>{c.classList.remove("placed","selected","dragging");c.querySelector(".grab-hint").textContent="หยิบ";c.style.left="";c.style.top="";});
  updateProgress();
  resultPanel.hidden=true;
  if(running)startMission();
  else{missionActive=false;showTimer(ROUND_SECONDS);say("เริ่มภารกิจใหม่: เปิดกล้องเพื่อเริ่มจับเวลา 15 วินาที");}
}
startBtn.addEventListener("click",startCamera);
resetBtn.addEventListener("click",resetGame);
playAgain.addEventListener("click",resetGame);
soundToggle.addEventListener("click",()=>{
  soundOn=!soundOn;
  soundToggle.textContent=soundOn?"🔊 เสียงเปิด":"🔇 ปิดเสียง";
  soundToggle.classList.toggle("muted",!soundOn);
  soundToggle.setAttribute("aria-pressed",String(soundOn));
  if(soundOn){audio();tone(660,.1,"sine",.04);}
});
window.addEventListener("beforeunload",()=>stream?.getTracks().forEach(t=>t.stop()));
updateProgress();
showTimer(ROUND_SECONDS);