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

const names = {cpu:"CPU",ram:"RAM",ssd:"SSD",gpu:"GPU"};
let landmarker, stream, running=false, wasPinching=false, held=null, score=0;
const placed = new Set();

function say(message,type=""){
  feedback.textContent=message;
  feedback.className="feedback "+type;
}
function updateProgress(){
  const count=placed.size;
  progressText.textContent=`ติดตั้งแล้ว ${count} / 4`;
  progressBar.style.width=(count/4*100)+"%";
  scoreEl.textContent=score;
  if(count===4) say("ยอดเยี่ยม! คุณติดตั้งอุปกรณ์ครบแล้ว ภารกิจสำเร็จ 🎉","good");
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
  const target=document.elementFromPoint(x,y)?.closest(".part-card");
  if(!target||target.classList.contains("placed")) return;
  held=target;
  held.classList.add("dragging","selected");
  held.style.left=(x-75)+"px";
  held.style.top=(y-28)+"px";
  gestureState.innerHTML='<span class="gesture-icon">🤏</span><span>กำลังหยิบ '+names[held.dataset.part]+'</span>';
  say("กำลังถือ "+names[held.dataset.part]+" — เคลื่อนมือไปยังช่องที่ต้องการ");
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
    say("ติดตั้ง "+names[part]+" ถูกต้อง! +100 คะแนน","good");
    updateProgress();
  }else if(slot){
    say("ตำแหน่งไม่ถูกต้อง ลองดูชื่อช่องบนเมนบอร์ดอีกครั้ง","bad");
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
      const pinching=distance(hand[4],hand[8])<0.055;
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
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480}},audio:false});
    video.srcObject=stream;
    await video.play();
    cameraStatus.textContent="กล้องทำงานอยู่";
    cameraDot.classList.add("on");
    if(!landmarker){
      say("กำลังโหลดระบบตรวจจับมือ...");
      const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
      landmarker=await HandLandmarker.createFromOptions(vision,{
        baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"GPU"},
        runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
      });
    }
    running=true;cursor.style.display="grid";loop();
    startBtn.textContent="กล้องเปิดแล้ว";startBtn.disabled=false;
    say("พร้อมแล้ว! ยกมือให้กล้องเห็น แล้วจีบนิ้วโป้งกับนิ้วชี้เพื่อหยิบ CPU ก่อน","good");
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
  updateProgress();say("เริ่มภารกิจใหม่: หยิบ CPU แล้ววางลงบน CPU SOCKET");
}
startBtn.addEventListener("click",startCamera);
resetBtn.addEventListener("click",resetGame);
window.addEventListener("beforeunload",()=>stream?.getTracks().forEach(t=>t.stop()));
updateProgress();