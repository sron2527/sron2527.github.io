const ORIGINS=new Set((process.env.ALLOWED_ORIGINS||"https://sron2527.github.io").split(",").map(s=>s.trim()).filter(Boolean));
function cors(req,res){const o=req.headers.origin;if(o&&ORIGINS.has(o)){res.setHeader("Access-Control-Allow-Origin",o);res.setHeader("Vary","Origin")}res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type")}
function clean(v,max=500){return String(v??"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
function imagePart(dataUrl){const m=String(dataUrl||"").match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);if(!m)return null;const bytes=Math.floor(m[2].length*3/4);if(bytes>1600000)throw new Error("IMAGE_TOO_LARGE");return {inline_data:{mime_type:m[1].replace("image/jpg","image/jpeg"),data:m[2]}}}
function parseJson(text){let t=String(text||"").trim();const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)t=t.slice(a,b+1);return JSON.parse(t)}
function textOf(d){return (d?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("\n").trim()}
async function gemini(parts){
 const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
 if(!key)throw new Error("NOT_CONFIGURED");
 const fastMode=Boolean(parts?.[0]?.text?.includes("__MOBILE_FAST__"));
 const models=["gemini-3.5-flash-lite","gemini-3.8-flash"];
 const started=Date.now(),deadline=fastMode?3200:4200;
 let last=null;
 for(let i=0;i<models.length;i++){
  const model=models[i],remaining=deadline-(Date.now()-started);
  if(remaining<650)break;
  const ctrl=new AbortController();
  const perTry=i===0?Math.min(fastMode?2400:3000,remaining):remaining;
  const timer=setTimeout(()=>ctrl.abort(),perTry);
  try{
   const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({
     contents:[{parts}],
     generationConfig:{
      responseMimeType:"application/json",
      maxOutputTokens:fastMode?140:190,
      thinkingConfig:{thinkingLevel:"minimal"}
     }
    }),
    signal:ctrl.signal
   });
   if(r.ok)return await r.json();
   const body=await r.text();
   last=new Error("Gemini "+r.status+" "+model+" "+body.slice(0,140));
   if(![404,429,500,502,503,504].includes(r.status))throw last;
   if(r.status!==404&&r.status!==429)break;
  }catch(e){
   last=e;
   if(e?.name==="AbortError")break;
  }finally{clearTimeout(timer)}
 }
 if(last?.name==="AbortError"||Date.now()-started>=deadline)throw new Error("AI_TIMEOUT");
 if(String(last?.message||"").includes("404"))throw new Error("MODEL_UNAVAILABLE");
 throw last||new Error("AI_FAILED");
}
export default async function handler(req,res){
 cors(req,res);res.setHeader("Cache-Control","no-store");if(req.method==="OPTIONS")return res.status(204).end();
 if(req.method==="GET")return res.status(200).json({ok:true,service:"ghostcam",configured:Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),version:"1.3.14.4"});
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 try{
  if(!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY))return res.status(503).json({error:req.body?.lang==="en"?"AI is not ready yet":"AI ยังไม่พร้อมใช้งาน",code:"NOT_CONFIGURED"});
  const frame=imagePart(req.body?.frame);if(!frame)return res.status(400).json({error:req.body?.lang==="en"?"No camera image received":"ไม่พบภาพจากกล้อง"});
  const motion=Math.max(0,Math.min(100,Number(req.body?.motion)||0));
  const poseCount=Math.max(0,Math.min(10,Number(req.body?.poseCount)||0));
  const lang=req.body?.lang==="en"?"en":"th";
  const mobileFast=Boolean(req.body?.mobileFast);
  const prompt=[
   mobileFast?"__MOBILE_FAST__":"",
   lang==="en"?"Analyze this camera frame for the Ghost Cam AI entertainment app. Describe ONLY visible evidence; never claim a ghost/spirit is real.":"วิเคราะห์เฟรมกล้องนี้สำหรับแอป Ghost Cam AI เพื่อความบันเทิง อธิบายเฉพาะสิ่งที่มองเห็น ห้ามยืนยันว่ามีผีหรือวิญญาณจริง",
   "motion="+motion+"%, poseCount="+poseCount,
   lang==="en"?(mobileFast?"Return very compact JSON. Prioritize humanLike, zone, anomalyScore, confidence, apparentAge, eraImpression and appearancePresentation. Keep observations/causes to at most 1 item.":"Return compact JSON. Detect human-like shape, approximate zone, visual anomaly 0-100, 1-3 observations, ordinary causes, confidence, apparent age RANGE only if clearly visible, era impression, and visible presentation as masculine-presenting/feminine-presenting/unable to determine."):(mobileFast?"ตอบ JSON สั้นมาก เน้น humanLike, zone, anomalyScore, confidence, apparentAge, eraImpression และ appearancePresentation โดย observations/possibleCauses อย่างละไม่เกิน 1 ข้อ":"ตอบ JSON แบบสั้น ตรวจรูปร่างคล้ายคน ตำแหน่ง คะแนนความผิดปกติ 0-100 สิ่งที่เห็น 1-3 ข้อ สาเหตุธรรมดา ความมั่นใจ ช่วงอายุเมื่อเห็นชัด ลักษณะยุค และลักษณะที่มองเห็นเป็น ดูคล้ายผู้ชาย/ดูคล้ายผู้หญิง/ระบุไม่ได้"),
   lang==="en"?'{"summary":"","anomalyScore":0,"humanLike":false,"people":0,"zone":"","observations":[],"possibleCauses":[],"confidence":0,"apparentAge":"Unable to estimate","ageConfidence":0,"eraImpression":"Unable to determine","appearancePresentation":"unable to determine","appearanceConfidence":0}':'{"summary":"","anomalyScore":0,"humanLike":false,"people":0,"zone":"","observations":[],"possibleCauses":[],"confidence":0,"apparentAge":"ระบุไม่ได้","ageConfidence":0,"eraImpression":"ระบุไม่ได้","appearancePresentation":"ระบุไม่ได้","appearanceConfidence":0}'
  ].join("\n");
  const d=await gemini([{text:prompt},frame]);const x=parseJson(textOf(d));
  const apparentAge=clean(x.apparentAge,80)||(lang==="en"?"Unable to estimate":"ระบุไม่ได้");
  const eraImpression=clean(x.eraImpression,100)||(lang==="en"?"Unable to determine":"ระบุไม่ได้");
  const appearancePresentation=clean(x.appearancePresentation,80)||(lang==="en"?"unable to determine":"ระบุไม่ได้");
  return res.status(200).json({
   ok:true,
   summary:clean(x.summary,500)||(lang==="en"?"No clear anomaly detected":"ยังไม่พบสิ่งผิดปกติชัดเจน"),
   anomalyScore:Math.max(0,Math.min(100,Number(x.anomalyScore)||0)),
   humanLike:Boolean(x.humanLike),
   people:Math.max(0,Math.min(10,Number(x.people)||0)),
   zone:clean(x.zone,120),
   observations:Array.isArray(x.observations)?x.observations.map(v=>clean(v,180)).filter(Boolean).slice(0,5):[],
   possibleCauses:Array.isArray(x.possibleCauses)?x.possibleCauses.map(v=>clean(v,180)).filter(Boolean).slice(0,5):[],
   confidence:Math.max(0,Math.min(100,Number(x.confidence)||0)),
   apparentAge,
   ageConfidence:Math.max(0,Math.min(100,Number(x.ageConfidence)||0)),
   eraImpression,
   appearancePresentation,
   appearanceConfidence:Math.max(0,Math.min(100,Number(x.appearanceConfidence)||0)),
   disclaimer:lang==="en"?"Age and appearance are estimates from visible presentation for entertainment only. They do not establish gender identity, biological sex, or anything supernatural":"อายุและลักษณะที่แสดงเป็นการประเมินจากสิ่งที่มองเห็นเพื่อความบันเทิง ไม่ใช่การยืนยันอัตลักษณ์ทางเพศ เพศกำเนิด หรือสิ่งเหนือธรรมชาติ"
  });
 }catch(e){
  const msg=String(e?.message||e);console.error("ghostcam",msg);
  const lang=req.body?.lang==="en"?"en":"th";
  if(msg.includes("IMAGE_TOO_LARGE"))return res.status(413).json({error:lang==="en"?"Camera image is too large":"ภาพจากกล้องมีขนาดใหญ่เกินไป",code:"IMAGE_TOO_LARGE"});
  if(msg.includes("AI_TIMEOUT"))return res.status(504).json({error:lang==="en"?"AI took too long. Using local sensor data instead.":"AI ตอบช้าเกินไป ระบบจะใช้ข้อมูลเซ็นเซอร์ในเครื่องชั่วคราว",code:"AI_TIMEOUT"});
  if(msg.includes("MODEL_UNAVAILABLE"))return res.status(503).json({error:lang==="en"?"AI model is temporarily unavailable.":"โมเดล AI ไม่พร้อมใช้งานชั่วคราว",code:"MODEL_UNAVAILABLE"});
  const m=msg.match(/Gemini\s+(\d{3})/);
  return res.status(502).json({error:lang==="en"?"AI could not analyze this frame. Please scan again.":"AI วิเคราะห์เฟรมนี้ไม่สำเร็จ กรุณาสแกนใหม่",code:m?"GEMINI_"+m[1]:"AI_ERROR"});
 }
}