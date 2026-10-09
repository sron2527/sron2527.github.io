const ORIGINS=new Set((process.env.ALLOWED_ORIGINS||"https://sron2527.github.io").split(",").map(s=>s.trim()).filter(Boolean));
function cors(req,res){const o=req.headers.origin;if(o&&ORIGINS.has(o)){res.setHeader("Access-Control-Allow-Origin",o);res.setHeader("Vary","Origin")}res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type")}
function clean(v,max=500){return String(v??"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
function imagePart(dataUrl){const m=String(dataUrl||"").match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);if(!m)return null;const bytes=Math.floor(m[2].length*3/4);if(bytes>1600000)throw new Error("IMAGE_TOO_LARGE");return {inline_data:{mime_type:m[1].replace("image/jpg","image/jpeg"),data:m[2]}}}
function parseJson(text){let t=String(text||"").trim();const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)t=t.slice(a,b+1);return JSON.parse(t)}
function textOf(d){return (d?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("\n").trim()}
async function gemini(parts){const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;if(!key)throw new Error("NOT_CONFIGURED");const models=[process.env.GEMINI_MODEL,"gemini-2.5-flash","gemini-2.0-flash"].filter((x,i,a)=>x&&a.indexOf(x)===i);let last;for(const model of models){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),18000);try{const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{parts}],generationConfig:{temperature:.15,responseMimeType:"application/json"}}),signal:ctrl.signal});if(r.ok)return await r.json();const body=await r.text();last=new Error("Gemini "+r.status+" "+model+" "+body.slice(0,300));if(![404,429,500,502,503,504].includes(r.status))throw last}catch(e){last=e}finally{clearTimeout(timer)}}throw last||new Error("AI_FAILED")}
export default async function handler(req,res){
 cors(req,res);res.setHeader("Cache-Control","no-store");if(req.method==="OPTIONS")return res.status(204).end();
 if(req.method==="GET")return res.status(200).json({ok:true,service:"ghostcam",configured:Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),version:"1.3"});
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 try{
  if(!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY))return res.status(503).json({error:"AI ยังไม่พร้อมใช้งาน",code:"NOT_CONFIGURED"});
  const frame=imagePart(req.body?.frame);if(!frame)return res.status(400).json({error:"ไม่พบภาพจากกล้อง"});
  const motion=Math.max(0,Math.min(100,Number(req.body?.motion)||0));
  const poseCount=Math.max(0,Math.min(10,Number(req.body?.poseCount)||0));
  const prompt=[
   "คุณเป็นระบบวิเคราะห์ภาพสำหรับเว็บ Ghost Cam AI เพื่อความบันเทิง",
   "วิเคราะห์เฉพาะสิ่งที่มองเห็นได้จริงในภาพ ห้ามอ้างว่าตรวจพบผี วิญญาณ หรือสิ่งเหนือธรรมชาติเป็นข้อเท็จจริง",
   "ให้มองหา: บุคคล รูปร่างคล้ายคน เงา แสงสะท้อน วัตถุที่อาจทำให้ระบบ pose เข้าใจผิด ความเบลอ และความผิดปกติทางภาพ",
   "ค่าจากอุปกรณ์: motion="+motion+"%, poseCount="+poseCount,
   "ถ้ามีรูปร่างคล้ายคนแต่ไม่ชัด ให้ใช้คำว่า รูปร่างคล้ายบุคคล และอธิบายสาเหตุที่อาจเป็นเงา วัตถุ หรือมุมกล้อง",
   "anomalyScore ให้เป็นคะแนนความผิดปกติทางภาพ 0-100 ไม่ใช่คะแนนว่ามีผี",
   "ตอบ JSON เท่านั้น:",
   '{"summary":"คำอธิบายภาษาไทยสั้นๆ","anomalyScore":0,"humanLike":false,"people":0,"zone":"ตำแหน่งโดยประมาณ เช่น กลางภาพ/ซ้ายบน","observations":["สิ่งที่เห็น 1","สิ่งที่เห็น 2"],"possibleCauses":["สาเหตุธรรมดาที่เป็นไปได้"],"confidence":0}'
  ].join("\n");
  const d=await gemini([{text:prompt},frame]);const x=parseJson(textOf(d));
  return res.status(200).json({ok:true,summary:clean(x.summary,500)||"ยังไม่พบสิ่งผิดปกติชัดเจน",anomalyScore:Math.max(0,Math.min(100,Number(x.anomalyScore)||0)),humanLike:Boolean(x.humanLike),people:Math.max(0,Math.min(10,Number(x.people)||0)),zone:clean(x.zone,120),observations:Array.isArray(x.observations)?x.observations.map(v=>clean(v,180)).filter(Boolean).slice(0,5):[],possibleCauses:Array.isArray(x.possibleCauses)?x.possibleCauses.map(v=>clean(v,180)).filter(Boolean).slice(0,5):[],confidence:Math.max(0,Math.min(100,Number(x.confidence)||0)),disclaimer:"ผลนี้เป็นการวิเคราะห์ภาพเพื่อความบันเทิง ไม่ใช่การยืนยันสิ่งเหนือธรรมชาติ"});
 }catch(e){const msg=String(e?.message||e);console.error("ghostcam",msg);if(msg.includes("IMAGE_TOO_LARGE"))return res.status(413).json({error:"ภาพจากกล้องมีขนาดใหญ่เกินไป"});const m=msg.match(/Gemini\s+(\d{3})/);return res.status(502).json({error:"AI วิเคราะห์เฟรมนี้ไม่สำเร็จ กรุณาลองใหม่",code:m?"GEMINI_"+m[1]:"AI_ERROR"})}
}