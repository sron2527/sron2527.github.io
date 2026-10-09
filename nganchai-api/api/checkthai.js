const ORIGINS=new Set((process.env.ALLOWED_ORIGINS||"https://sron2527.github.io").split(",").map(s=>s.trim()).filter(Boolean));
function cors(req,res){const o=req.headers.origin;if(o&&ORIGINS.has(o)){res.setHeader("Access-Control-Allow-Origin",o);res.setHeader("Vary","Origin")}res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type")}
function clean(v,max=500){return String(v??"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
function dataPart(dataUrl){const m=String(dataUrl||"").match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);if(!m)return null;const bytes=Math.floor(m[2].length*3/4);if(bytes>1700000)throw new Error("IMAGE_TOO_LARGE");return {inline_data:{mime_type:m[1].replace("image/jpg","image/jpeg"),data:m[2]}}}
async function callVisionWeb(images){
 const key=process.env.GOOGLE_VISION_API_KEY||process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
 if(!key)return {ok:false,reason:"NOT_CONFIGURED",labels:[],entities:[],pages:[],evidence:""};
 const usable=(images||[]).filter(Boolean).slice(0,3);if(!usable.length)return {ok:false,reason:"NO_IMAGE",labels:[],entities:[],pages:[],evidence:""};
 const body={requests:usable.map(img=>({image:{content:img.inline_data.data},features:[{type:"WEB_DETECTION",maxResults:15}]}))};
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),18000);
 try{
  const rr=await fetch("https://vision.googleapis.com/v1/images:annotate?key="+encodeURIComponent(key),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:ctrl.signal});
  if(!rr.ok){const t=await rr.text();return {ok:false,reason:"HTTP_"+rr.status,detail:t.slice(0,180),labels:[],entities:[],pages:[],evidence:""}}
  const d=await rr.json(),labels=[],entities=[],pages=[],seen=new Set();
  for(const resp of (d.responses||[])){const w=resp.webDetection||{};
   for(const x of (w.bestGuessLabels||[])){const v=clean(x.label,160);if(v&&!labels.includes(v))labels.push(v)}
   for(const x of (w.webEntities||[])){const v=clean(x.description,160);if(v&&!entities.includes(v))entities.push(v)}
   for(const x of (w.pagesWithMatchingImages||[])){const url=x.url;if(!url||seen.has(url))continue;seen.add(url);let domain="";try{domain=new URL(url).hostname.replace(/^www\./,"")}catch{}pages.push({title:clean(x.pageTitle||domain||"ผลการเทียบภาพจากเว็บ",180),url,domain})}
  }
  const evidence=["Best guess: "+labels.slice(0,6).join(", "),"Web entities: "+entities.slice(0,10).join(", "),"Matching pages: "+pages.slice(0,8).map(x=>x.title+" | "+x.url).join(" ; ")].filter(x=>!/: $/.test(x)).join("\n");
  return {ok:true,reason:"OK",labels:labels.slice(0,10),entities:entities.slice(0,15),pages:pages.slice(0,10),evidence};
 }catch(e){return {ok:false,reason:"ERROR",detail:clean(e?.message||e,180),labels:[],entities:[],pages:[],evidence:""}}finally{clearTimeout(timer)}
}
async function callGemini(parts,opt={}){const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;if(!key)throw new Error("GEMINI_NOT_CONFIGURED");const primary=process.env.GEMINI_MODEL||"gemini-3.8-flash";const models=[primary,"gemini-3.5-flash-lite"].filter((x,i,a)=>a.indexOf(x)===i);let lastErr=null;for(const model of models){const body={contents:[{parts}],generationConfig:{temperature:.2}};if(opt.json)body.generationConfig.responseMimeType="application/json";if(opt.search)body.tools=[{google_search:{}}];const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),22000);try{const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify(body),signal:ctrl.signal});if(r.ok)return await r.json();const t=await r.text();lastErr=new Error("Gemini "+r.status+" "+model+" "+t.slice(0,300));if(![429,500,502,503,504].includes(r.status))throw lastErr}catch(e){lastErr=e;if(String(e?.message||e).includes("Gemini 403"))throw e}finally{clearTimeout(timer)}}throw lastErr||new Error("GEMINI_FAILED")}
function textOf(d){return (d?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("\n").trim()}
function parseJson(text){let t=String(text||"").trim().replace(/^```json/i,"").replace(/^```/,"").replace(/```$/,"").trim();const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)t=t.slice(a,b+1);return JSON.parse(t)}
function sourcesOf(d){const gm=d?.candidates?.[0]?.groundingMetadata||d?.candidates?.[0]?.grounding_metadata||{};const chunks=gm.groundingChunks||gm.grounding_chunks||[];const out=[],seen=new Set();for(const c of chunks){const w=c.web||c?.chunk?.web;const url=w?.uri||w?.url;if(!url||seen.has(url))continue;seen.add(url);let domain="";try{domain=new URL(url).hostname.replace(/^www\./,"")}catch{}out.push({title:clean(w?.title||domain||"แหล่งข้อมูล",180),url,domain})}return out.slice(0,8)}
function mergeSources(a,b){const out=[],seen=new Set();for(const x of [...(a||[]),...(b||[])]){if(!x?.url||seen.has(x.url))continue;seen.add(x.url);out.push({title:clean(x.title||x.domain||"แหล่งข้อมูล",180),url:x.url,domain:clean(x.domain,120)});if(out.length>=10)break}return out}
export default async function handler(req,res){
 cors(req,res);if(req.method==="OPTIONS")return res.status(204).end();res.setHeader("Cache-Control","no-store");if(req.method==="GET")return res.status(200).json({ok:true,service:"checkthai",configured:Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),model:process.env.GEMINI_MODEL||"gemini-3.8-flash"});if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 try{
  if(!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY))return res.status(503).json({error:"ระบบวิเคราะห์ไม่พร้อมชั่วคราว กรุณาลองใหม่อีกครั้งภายหลัง",code:"NOT_CONFIGURED"});
  const mode=req.body?.mode==="antique"?"antique":"amulet";const front=dataPart(req.body?.front);const back=dataPart(req.body?.back);const detail=dataPart(req.body?.detail);if(!front)return res.status(400).json({error:"กรุณาส่งรูปด้านหน้าก่อน"});
  const note=clean(req.body?.note,500);const subject=mode==="amulet"?"พระเครื่องไทย":"ของเก่า ของโบราณ หรือของสะสม";
  const prompt=["คุณเป็นผู้ช่วยวิเคราะห์ภาพสำหรับเว็บเช็คของไทย AI",
"วัตถุในภาพคือโหมด: "+subject,
"ให้ทำ visual forensics ก่อนเดาชื่อ: บรรยายรูปทรง บุคคล/ท่าทาง ฐาน ซุ้ม ขอบ รอยหล่อ ลวดลาย ตรา ตัวเลข และตัวอักษรที่มองเห็น",
mode==="amulet"?"สำหรับพระเครื่อง ให้แยกชนิดก่อน เช่น พระพุทธรูป พระเกจิ พระสังกัจจายน์ พระอุปคุต พระปิดตา เหรียญ รูปหล่อ หรือพิมพ์อื่น ห้ามสรุปจากความคล้ายกว้างๆ":"สำหรับของเก่า ให้ระบุชนิด ตรา ยี่ห้อ รุ่น ประเทศ วัสดุ และเครื่องหมายก่อน",
"ถ้ามีตัวอักษรหรือเลข ให้อ่านตามภาพตรงๆ และใส่ใน inscriptions โดยห้ามแต่งคำที่มองไม่เห็น",
"ถ้าข้อมูลไม่พอ ให้สร้าง alternatives 2-5 ตัวเลือก พร้อมเหตุผลว่าคล้ายตรงไหนและยังขาดอะไร",
"ห้ามยืนยันว่าแท้หรือปลอม และห้ามอ้างว่ารับรองมูลค่า",
"ข้อมูลเพิ่มเติมจากผู้ใช้: "+(note||"ไม่มี"),
back?"มีภาพด้านหลัง":"ยังไม่มีภาพด้านหลัง ให้ลดความมั่นใจและแนะนำให้ถ่ายเพิ่ม",
detail?"มีภาพรายละเอียดเพิ่มเติม":"ยังไม่มีภาพรายละเอียด/ตัวอักษรใกล้ๆ",
"คืน JSON เท่านั้นตามโครงสร้างนี้:",
'{ "name":"ชื่อที่คาดว่าใกล้เคียงที่สุด หรือ ยังระบุไม่ได้ชัดเจน", "type":"ประเภท/รุ่น/พิมพ์", "origin":"วัด/ผู้สร้าง/แบรนด์/แหล่งที่มา", "era":"ช่วงปีหรือยุค", "material":"วัสดุ/เนื้อ", "confidence":0, "summary":"สรุปภาษาไทย", "features":["จุดสังเกตจากภาพ"], "inscriptions":["ข้อความหรือตัวเลขที่อ่านได้"], "alternatives":[{"name":"ตัวเลือกอื่น","reason":"เหตุผล","confidence":0}], "searchQuery":"คำค้นที่เฉพาะเจาะจง", "photoAdvice":["ควรถ่ายอะไรเพิ่ม"] }',
"confidence คือความมั่นใจในการระบุชนิด/รุ่นเท่านั้น ไม่ใช่ความแท้"].join("\n");
  const parts=[{text:prompt},front];if(back)parts.push(back);if(detail)parts.push(detail);const vision=await callGemini(parts,{json:true});let info;try{info=parseJson(textOf(vision))}catch{throw new Error("AI_PARSE_IDENTIFY")}
  info.confidence=Math.max(0,Math.min(100,Number(info.confidence)||0));if(!back)info.confidence=Math.min(info.confidence,60);info.name=clean(info.name,180)||"ยังระบุไม่ได้ชัดเจน";info.type=clean(info.type,180);info.origin=clean(info.origin,180);info.era=clean(info.era,120);info.material=clean(info.material,120);info.summary=clean(info.summary,400);info.features=Array.isArray(info.features)?info.features.map(x=>clean(x,180)).filter(Boolean).slice(0,10):[];info.inscriptions=Array.isArray(info.inscriptions)?info.inscriptions.map(x=>clean(x,160)).filter(Boolean).slice(0,8):[];info.alternatives=Array.isArray(info.alternatives)?info.alternatives.map(x=>({name:clean(x?.name,180),reason:clean(x?.reason,260),confidence:Math.max(0,Math.min(100,Number(x?.confidence)||0))})).filter(x=>x.name).slice(0,5):[];info.photoAdvice=Array.isArray(info.photoAdvice)?info.photoAdvice.map(x=>clean(x,180)).filter(Boolean).slice(0,6):[];
  const web=await callVisionWeb([front,back,detail]);
let sources=web.pages||[],market={priceRange:"ยังประเมินไม่ได้",priceNote:"ยังไม่พบข้อมูลตลาดที่น่าเชื่อถือเพียงพอจากการค้นครั้งนี้"};
const q=clean([info.searchQuery,info.name,info.type,info.origin,...(web.labels||[]).slice(0,3),...(web.entities||[]).slice(0,4)].filter(Boolean).join(" "),420);
if(q){
 const verifyPrompt=["ตรวจสอบการระบุ "+subject+" โดยใช้ Google Search",
 "ผลสังเกตจากภาพรอบแรก: "+JSON.stringify({name:info.name,type:info.type,origin:info.origin,era:info.era,material:info.material,features:info.features,inscriptions:info.inscriptions,alternatives:info.alternatives}),
 "หลักฐานจาก Google Vision Web Detection: "+(web.evidence||"ยังไม่มี/ยังไม่ได้เปิด Vision API"),
 "คำค้นเริ่มต้น: "+q,
 "ให้ค้นหลายแหล่งและเปรียบเทียบชื่อ พิมพ์ ลักษณะ ตัวอักษร ปี วัด/ผู้สร้าง ก่อนสรุป ห้ามเปลี่ยนเป็นชื่อที่ไม่สัมพันธ์กับจุดสังเกตจากภาพ",
 "หากยังไม่แน่ใจ ให้เก็บ alternatives และลด confidence อย่าฟันธง",
 "ราคาให้ใช้เฉพาะเมื่อพบรายการตลาดที่ระบุรุ่นตรงกัน ควรบอกว่าเป็นราคาตั้งขายหรือข้อมูลซื้อขายถ้ารู้ หากหลักฐานไม่พอให้ตอบ ยังประเมินไม่ได้",
 "ตอบ JSON เท่านั้น: "+JSON.stringify({name:"",type:"",origin:"",era:"",material:"",confidence:0,summary:"",features:[],alternatives:[],priceRange:"",priceNote:"",photoAdvice:[]})
 ].join("\n");
 try{
  const grounded=await callGemini([{text:verifyPrompt}],{search:true});
  sources=mergeSources(sources,sourcesOf(grounded));
  const raw=textOf(grounded);let checked=null;try{checked=parseJson(raw)}catch{}
  if(checked){
   info.name=clean(checked.name,180)||info.name;info.type=clean(checked.type,180)||info.type;info.origin=clean(checked.origin,180)||info.origin;info.era=clean(checked.era,120)||info.era;info.material=clean(checked.material,120)||info.material;
   info.confidence=Math.max(0,Math.min(100,Number(checked.confidence)||info.confidence));if(!back)info.confidence=Math.min(info.confidence,60);
   info.summary=clean(checked.summary,500)||info.summary;info.features=Array.isArray(checked.features)?checked.features.map(x=>clean(x,180)).filter(Boolean).slice(0,10):info.features;
   info.alternatives=Array.isArray(checked.alternatives)?checked.alternatives.map(x=>({name:clean(x?.name,180),reason:clean(x?.reason,260),confidence:Math.max(0,Math.min(100,Number(x?.confidence)||0))})).filter(x=>x.name).slice(0,5):info.alternatives;
   info.photoAdvice=Array.isArray(checked.photoAdvice)?checked.photoAdvice.map(x=>clean(x,180)).filter(Boolean).slice(0,6):info.photoAdvice;
   market.priceRange=clean(checked.priceRange,140)||market.priceRange;market.priceNote=clean(checked.priceNote,600)||market.priceNote;
  }else market.priceNote=clean(raw,600)||market.priceNote;
 }catch(e){market.priceNote="ระบุจากภาพได้เบื้องต้น แต่การตรวจสอบเว็บ/ราคาไม่สำเร็จในรอบนี้ ควรลองใหม่หรือเพิ่มภาพด้านหลังและภาพรายละเอียด"}
}
if(info.confidence<35){market.priceRange="ยังประเมินไม่ได้";market.priceNote="ความมั่นใจในการระบุยังต่ำ จึงไม่แสดงราคาที่อาจทำให้เข้าใจผิด"}
  return res.status(200).json({ok:true,privacyMode:"stateless",version:"1.2",name:info.name,type:info.type,origin:info.origin,era:info.era,material:info.material,confidence:info.confidence,summary:info.summary,features:info.features,inscriptions:info.inscriptions,alternatives:info.alternatives,photoAdvice:info.photoAdvice,priceRange:market.priceRange,priceNote:market.priceNote,sources,visionUsed:Boolean(web.ok),visionStatus:web.reason,visionLabels:web.labels||[]});
 }catch(e){const msg=String(e?.message||e);if(msg.includes("GEMINI_NOT_CONFIGURED"))return res.status(503).json({error:"ระบบวิเคราะห์ไม่พร้อมชั่วคราว กรุณาลองใหม่อีกครั้งภายหลัง"});if(msg.includes("IMAGE_TOO_LARGE"))return res.status(413).json({error:"รูปมีขนาดใหญ่เกินไป กรุณาถ่ายหรือเลือกใหม่"});console.error("checkthai",msg);const m=msg.match(/Gemini\s+(\d{3})/);return res.status(502).json({error:"วิเคราะห์ไม่สำเร็จในขณะนี้ กรุณาลองใหม่ด้วยภาพที่ชัดขึ้น",code:m?"GEMINI_"+m[1]:(msg.includes("AI_PARSE_IDENTIFY")?"AI_PARSE":"AI_ERROR")})}
}