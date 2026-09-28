import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import https from 'node:https';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

// ── DB grounding (mirrors api/_lib/allowlist.ts + itinerary-prompt.ts) ──
const CATALOG_TITLES: Array<{ title: string; kind: string }> = [
  { title: "Cagsawa Ruins", kind: "catalog" },
  { title: "Mayon Skyline", kind: "catalog" },
  { title: "Sumlang Lake", kind: "catalog" },
  { title: "Albay Coffee House", kind: "catalog" },
  { title: "Legazpi Local Market", kind: "catalog" },
  { title: "Pacific Mall Legazpi", kind: "catalog" },
  { title: "The Oriental Legazpi", kind: "catalog" },
  { title: "Mayon ATV Adventure", kind: "catalog" },
  { title: "Ibalong Street Festival", kind: "catalog" },
  { title: "Legazpi Weekend Night Market", kind: "catalog" },
  { title: "Bacacay coast and island views", kind: "route" },
  { title: "Mayon nature and photography walk", kind: "route" },
  { title: "Market shopping and Bicolano tasting", kind: "route" },
  { title: "Albay arts and museum stop", kind: "route" },
  { title: "Local market and crafts", kind: "route" },
  { title: "Legazpi evening spots", kind: "route" },
  { title: "Mayon golden-hour photo stop", kind: "route" },
  { title: "Lakeside rest and wellness break", kind: "route" },
  { title: "Albay Park & Wildlife", kind: "route" },
  { title: "Sunset at Legazpi Boulevard", kind: "route" },
  { title: "Daraga faith and heritage trail", kind: "route" },
  { title: "Local festival or community event", kind: "route" },
  { title: "Guide-picked Albay hidden gem", kind: "route" },
  { title: "Quitinday Hills", kind: "catalog" },
  { title: "Vera Falls", kind: "catalog" },
  { title: "Hoyop-Hoyopan Cave", kind: "catalog" },
  { title: "Legazpi Boulevard", kind: "route" },
  { title: "Daraga Church", kind: "route" },
];

function normalizeTitle(v: string): string { return v.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim(); }
function levenshtein(a: string, b: string): number {
  const al=a.length, bl=b.length; if(!al) return bl; if(!bl) return al;
  const m: number[][] = Array.from({length:al+1},()=>Array(bl+1).fill(0));
  for(let i=0;i<=al;i++) m[i][0]=i; for(let j=0;j<=bl;j++) m[0][j]=j;
  for(let i=1;i<=al;i++) for(let j=1;j<=bl;j++){ const c=a[i-1]===b[j-1]?0:1; m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+c); }
  return m[al][bl];
}
function similarity(a: string,b: string): number { const mx=Math.max(a.length,b.length); return mx===0?1:1-levenshtein(a,b)/mx; }
type AllowEntry = { title:string; kind:string; normalized:string };
function buildAllowlist(names: string[]): AllowEntry[] {
  const entries: AllowEntry[]=[]; const seen=new Set<string>();
  for(const n of names){ const norm=normalizeTitle(n); if(!norm||seen.has(norm)) continue; seen.add(norm); entries.push({title:n.trim(),kind:"business",normalized:norm}); }
  for(const c of CATALOG_TITLES){ const norm=normalizeTitle(c.title); if(seen.has(norm)) continue; seen.add(norm); entries.push({title:c.title,kind:c.kind,normalized:norm}); }
  return entries;
}
function checkTitle(title: string, allowlist: AllowEntry[]) {
  const norm=normalizeTitle(title); if(!norm) return {allowed:false,similarity:0} as const;
  for(const e of allowlist) if(e.normalized===norm) return {allowed:true,canonicalTitle:e.title,similarity:1} as const;
  for(const e of allowlist) if(norm.includes(e.normalized)||e.normalized.includes(norm)){ const sim=Math.max(e.normalized.length/norm.length,norm.length/e.normalized.length); if(sim>=0.6) return {allowed:true,canonicalTitle:e.title,similarity:sim} as const; }
  let best: AllowEntry|null=null; let bestSim=0; for(const e of allowlist){ const s=similarity(norm,e.normalized); if(s>bestSim){bestSim=s; best=e;} }
  if(best && bestSim>=0.82) return {allowed:true,canonicalTitle:best.title,similarity:bestSim} as const;
  return {allowed:false,similarity:bestSim} as const;
}
function enforceAllowlist(itinerary: Array<{day:number;title:string;stops:Array<{time:string;title:string;note:string;icon:string}>}>, allowlist: AllowEntry[]) {
  const warnings: string[]=[]; let dropped=0; let repairedCount=0;
  const repaired = itinerary.map((day)=>{ const valid: typeof day.stops = []; for(const stop of day.stops){ const ch=checkTitle(stop.title,allowlist); if((ch as any).allowed && (ch as any).canonicalTitle){ if((ch as any).canonicalTitle!==stop.title) repairedCount++; valid.push({...stop,title:(ch as any).canonicalTitle}); } else dropped++; } if(valid.length===0 && day.stops.length>0){ warnings.push(`Day ${day.day}: all stops were outside the database and were replaced with nearest allowed place.`); const fb=allowlist.find(e=>e.kind==="catalog")??allowlist[0]; if(fb) valid.push({time:"9:00 AM",title:fb.title,note:"Fallback to a verified Albay place from the app database.",icon:"explore"}); } return {...day,stops:valid}; });
  if(dropped>0) warnings.unshift(`${dropped} stop(s) were not in the app database and were mapped to the nearest allowed place.`);
  if(repairedCount>0 && dropped===0) warnings.push(`${repairedCount} stop title(s) were normalized to match the database exactly.`);
  return {repaired,warnings,dropped,repairedCount};
}
function cleanText(v: unknown, max:number): string { if(typeof v!=="string") return ""; return (v as string).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0,max); }
function sanitizeBusinesses(v: unknown): Array<{name:string;category:string;location:string;hours:string;about:string}> {
  if(!Array.isArray(v)) return [];
  return (v as unknown[]).slice(0,25).map((b)=>{ const c=(b && typeof b==="object"?b:{} as Record<string,unknown>) as Record<string,unknown>; return { name: cleanText(c["name"],120), category: cleanText(c["category"],80), location: cleanText(c["location"],160), hours: cleanText(c["hours"],160), about: cleanText(c["about"],500)}; }).filter(b=>b.name && b.category && b.location);
}
function parseDayCountFromPrompt(prompt: string, fallback = 2, maxDays = 7): number {
  const m = prompt.match(/(\d+)\s*(?:[- ]?day|days)/i);
  if(m){ const n=parseInt(m[1],10); if(n>=1&&n<=maxDays) return n; }
  if(/weekend/i.test(prompt)) return 2;
  if(/day trip|one day|single day/i.test(prompt)) return 1;
  return fallback;
}
function parseDayCountIfPresent(prompt: string, maxDays = 7): number | null {
  const direct = prompt.match(/(\d+)\s*(?:[- ]?day|days|\bd\b)/i);
  if(direct){ const n=parseInt(direct[1],10); if(n>=1&&n<=maxDays) return n; }
  if(/\bweekend\b/i.test(prompt)) return 2;
  if(/\bday trip\b|\bone day\b|\bsingle day\b/i.test(prompt)) return 1;
  const short = prompt.match(/\b([1-7])d\b/);
  if(short){ const n=parseInt(short[1],10); if(n>=1&&n<=maxDays) return n; }
  return null;
}
function parsePaceFromPrompt(prompt: string, fallback = "Balanced"): string {
  const p=prompt.toLowerCase();
  if(/\brelaxed\b|\bchill\b|\bslow\b|\beasy\b|\bgentle\b|\bleisurely\b/.test(p)) return "Relaxed";
  if(/\bpacked\b|\bbusy\b|\bintense\b|\bfull\b|\bjam.?packed\b|\bmaximize\b/.test(p)) return "Packed";
  if(/\bbalanced\b|\bmoderate pace\b/.test(p)) return "Balanced";
  return fallback;
}
function parseBudgetFromPrompt(prompt: string, fallback = "Moderate"): string {
  const p=prompt.toLowerCase();
  if(/\bpremium\b|\bluxury\b|\bhigh.?end\b|\bupscale\b|\b5k\b|\bexpensive\b/.test(p)) return "Premium";
  if(/\bmoderate\b/.test(p)) return "Moderate";
  if(/\bbudget\b|\bcheap\b|\baffordable\b|\blow.?cost\b|\bthrifty\b|\btipid\b/.test(p)) return "Budget";
  return fallback;
}
function viabilityWarnings(itinerary: Array<{day:number;title:string;stops:Array<{time:string;title:string;note:string;icon:string}>}>, expectedDays: number, pace: string): string[] {
  const warnings: string[]=[]; if(itinerary.length!==expectedDays) warnings.push(`Itinerary has ${itinerary.length} days but ${expectedDays} requested — check day count.`);
  for(const d of itinerary){ if(d.stops.length<2) warnings.push(`Day ${d.day} has only ${d.stops.length} stop(s) — may feel sparse for ${pace} pace.`); if(d.stops.length>4) warnings.push(`Day ${d.day} has ${d.stops.length} stops — may be too packed for ${pace} pace.`); if(pace==="Relaxed"&&d.stops.length>2) warnings.push(`Day ${d.day} has ${d.stops.length} stops but pace is Relaxed — consider fewer stops.`); if(pace==="Packed"&&d.stops.length<3) warnings.push(`Day ${d.day} has only ${d.stops.length} stops for Packed pace — could add more.`); const titles=d.stops.map(s=>s.title.toLowerCase()); const dup=titles.filter((t,i)=>titles.indexOf(t)!==i); if(dup.length) warnings.push(`Day ${d.day} repeats "${dup[0]}" — duplicated stop.`); for(const s of d.stops){ if(!s.note||s.note.length<10) warnings.push(`Stop "${s.title}" has a short note — may need more helpful detail.`); if(!s.time) warnings.push(`Stop "${s.title}" missing time — add realistic time.`); } } return warnings;
}
const VALID_ICONS = new Set(["landscape","restaurant","museum","shopping_bag","photo_camera","directions_walk","tour","hotel","storefront","church","festival","beach_access","spa","hiking","sports_motorsports","explore","water_drop","park","local_cafe","payments","interests","family_restroom","celebration","done_all","place"]);
function formatBusiness(b:{name:string;category:string;location:string;hours:string;about:string}): string { return `[Small Business] ${b.name} | ${b.category} | ${b.location} | Hours: ${b.hours} | About: ${b.about}`; }
function formatCatalog(entries: Array<{title:string;kind:string}>): string { return entries.map(e=>`[Catalog ${e.kind}] ${e.title}`).join("\n"); }
function buildSystemPrompt(opts:{dayCount:number; businesses: Array<{name:string;category:string;location:string;hours:string;about:string}>; catalogEntries: Array<{title:string;kind:string}>; isChat:boolean; pace?: string; budget?: string;}): string {
  const lines: string[]=[]; if(opts.businesses.length>0){ lines.push("REGISTERED SMALL BUSINESSES (from app database, prefer these when relevant):"); for(const b of opts.businesses.slice(0,25)) lines.push(formatBusiness(b)); } lines.push("VERIFIED ALBAY CATALOG PLACES (from app database):"); for(const c of opts.catalogEntries) lines.push(formatCatalog([c])); const allowedListText=lines.join("\n"); const iconList=Array.from(VALID_ICONS).join(", "); const pace=opts.pace||"Balanced"; const budget=opts.budget||"Moderate";
  if(opts.isChat){
    return ["You are Hilinga AI — a warm, locally-rooted travel companion for Albay, Philippines.","You chat like ChatGPT / Claude / Gemini: friendly, concise, empathetic, naturally conversational, with subtle humor when appropriate. You remember the last 10 turns and refer to the previous itinerary when the user asks to refine.",`Your core job: design a coherent, realistic itinerary focused purely within Albay province, using ONLY places from the ALLOWED PLACES LIST below. Keep stops clustered by proximity (under 45 min drive between stops) so travelers don't crisscross.`,"",`CURRENT TRIP CONTEXT (defaults — user's latest message ALWAYS overrides these):`,`- Requested days: ${opts.dayCount} — if user says "make it 3 days", "2d", "extend to 4 days", "weekend trip", etc., use THAT number instead. Day count must be 1–7.`,`- Travel pace: ${pace} — Relaxed = 2 stops/day, long breaks, gentle walks; Balanced = 3 stops/day, moderate activity; Packed = 4 stops/day, maximize sights. If user says "more relaxed" / "chill" / "slow" interpret as Relaxed; "packed" / "full" / "intense" as Packed.`,`- Budget: ${budget} — Budget = ₱300–₱700/person/day (value eats, markets, free sights); Moderate = ₱700–₱1,500; Premium = ₱1,500+ (upscale dining, private tours, resorts). If user says "budget-friendly" / "cheap" use Budget; "luxury" / "premium" use Premium.`,`- You have conversation history — use it. If user says "make Day 2 more relaxed" adjust ONLY Day 2. If they say "add a local cafe" swap one stop for a registered Small Business. If they say "swap for nature" prefer Quitinday Hills, Vera Falls, Hoyop-Hoyopan Cave, Sumlang Lake, etc.`,"","STRICT DATABASE GROUNDING — VIOLATION = FAIL:","- You may ONLY use place titles that appear verbatim in the ALLOWED PLACES LIST below.","- Copy Title exactly — no paraphrasing or suffixes. Never invent a place. If user asks for something not in the list, politely explain you only cover verified Albay spots and propose the closest alternative from the list.","","ALLOWED PLACES LIST:",allowedListText,"","HOW TO RESPOND (chat mode):","1) First write a friendly 2–4 sentence markdown reply. Explain choices naturally, cite registered small businesses by exact name, note how you matched pace/budget/days.","2) Then ONLY if the user wants trip planning, creation, or refinement, on a NEW line output a fenced ```json block containing ONLY {\"itinerary\": [...] } . The JSON must be valid, must contain exactly the requested day count (1–7), each day 2–4 stops matching the pace, and every stop title from the ALLOWED LIST. If the user's message is pure chitchat (e.g., \"hello\", \"what can you do?\") reply in markdown ONLY without any JSON.",`Schema: {"itinerary":[{"day":1,"title":"Day 1: Title — short, evocative","stops":[{"time":"8:30 AM","title":"Exact Allowed Title","note":"1–2 sentences: what to do, tip, why it fits pace/budget","icon":"landscape"}]}]}`,`Allowed icon values: ${iconList}.`,"Keep notes helpful, specific, and locally grounded. Mention food (Bicol Express, pinangat, pili), transport tips, or hours where relevant.","VIABILITY: Ensure itinerary is logistically viable for Albay — don't put Daraga Church then Vera Falls then Legazpi Boulevard in one morning without travel buffer. Balance food, nature, culture across days."].join(" ");
  }
  const chatInstruction = opts.isChat ? "You are in a conversational thread. First write a friendly 2-3 sentence markdown reply that explains your choices and cites which small businesses you used. Then on a new line output a fenced ```json block containing ONLY {\\\"itinerary\\\": [...] } . The JSON must be valid." : "Output MUST be ONLY a valid JSON object without any conversational text."; return ["You are Hilinga, an expert local travel itinerary assistant for Albay, Philippines.",`Design a coherent, realistic ${opts.dayCount}-day itinerary focused purely within Albay province.`,"Highlight real Albay attractions. Keep stops logically sequenced by proximity so travelers avoid crisscrossing.","","STRICT DATABASE GROUNDING — VIOLATION = FAIL:","- You may ONLY use place titles that appear verbatim in the ALLOWED PLACES LIST below.","- Do NOT invent, paraphrase, translate, or add suffixes/prefixes to titles. Copy Title exactly.","- If the request cannot be satisfied from the list, say so in your markdown and propose the closest alternative from the list.","- Never output a title not in the list.","","ALLOWED PLACES LIST:",allowedListText,"",chatInstruction,`Schema: {"itinerary":[{"day":1,"title":"Day 1 Title","stops":[{"time":"8:30 AM","title":"Exact Allowed Title","note":"Description, tips, culinary highlights","icon":"landscape"}]}]}`,`Allowed icon values: ${iconList}.`,"Each day must have between 2 and 4 stops. Times should be realistic (e.g., 8:30 AM)."].join(" ");
}

function devItineraryPlugin() {
  return {
    name: 'dev-itinerary-api',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const urlPath = (req.url || '').split('?')[0];
        const isItinerary = urlPath === '/api/itinerary' && req.method === 'POST';
        const isChat = urlPath === '/api/itinerary-chat' && req.method === 'POST';
        if (isItinerary || isChat) {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const env = loadEnv('development', rootDir, '');
              const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY || "";
              if (!apiKey) {
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured. Set GEMINI_API_KEY in .env (https://aistudio.google.com/app/apikey).' }));
                return;
              }
              const model = process.env.GEMINI_MODEL || env.GEMINI_MODEL || process.env.GOOGLE_MODEL || env.GOOGLE_MODEL || process.env.REQUESTY_MODEL || env.REQUESTY_MODEL || 'gemini-3-flash-preview';

              const isChatMode = isChat;
              const rawPrompt = body.prompt || body.message || body.content || (body.answers ? JSON.stringify(body.answers) : 'Albay travel itinerary');
              const requestedDays = Math.max(1, Math.min(7, Number(body.days) || 2));
              const history: Array<{ role: string; content: string }> = Array.isArray(body.history) ? body.history.slice(-12) : Array.isArray(body.messages) ? body.messages.slice(-12) : [];
              const sanitizedHistory = history
                .filter((m: any) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
                .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

              const localBusinesses = sanitizeBusinesses(body.localBusinesses);
              const allowlist = buildAllowlist(localBusinesses.map((b)=>b.name));

              let userContent: string;
              let systemPrompt: string;
              let temperature = 0.7;

              if (isChatMode) {
                // Natural-language understanding so pills are not needed — mirrors api/itinerary-chat.ts
                const inferredDays = parseDayCountIfPresent(String(rawPrompt), 7);
                const effectiveDays = inferredDays !== null ? inferredDays : requestedDays;
                const effectivePace = parsePaceFromPrompt(String(rawPrompt), typeof body.pace === "string" && body.pace ? String(body.pace) : "Balanced");
                const effectiveBudget = parseBudgetFromPrompt(String(rawPrompt), typeof body.budget === "string" && body.budget ? String(body.budget) : "Moderate");
                // use effectiveDays for system prompt and later slicing so "2d relaxed budget" just works
                (body as any).__effectiveDays = effectiveDays;
                (body as any).__effectivePace = effectivePace;
                (body as any).__effectiveBudget = effectiveBudget;
                userContent = `${String(rawPrompt).slice(0, 2500)}\nBudget level: ${String(effectiveBudget).slice(0,50)}\nTravel pace: ${String(effectivePace).slice(0,50)}\nRequested days: ${effectiveDays}`;
                systemPrompt = buildSystemPrompt({ dayCount: effectiveDays, businesses: localBusinesses, catalogEntries: CATALOG_TITLES as any, isChat: true, pace: effectivePace, budget: effectiveBudget });
                temperature = 0.35;
              } else {
                const refinePrompt = body.refinePrompt || '';
                const existingItinerary = body.existingItinerary;
                if (refinePrompt && existingItinerary) {
                  userContent = `Refine this existing ${existingItinerary.length}-day itinerary with instruction: "${refinePrompt}"\nExisting itinerary:\n${JSON.stringify(existingItinerary)}`;
                } else {
                  userContent = `Create a ${requestedDays}-day Albay, Philippines itinerary for:\n"${rawPrompt}"`;
                  if (body.budget) userContent += `\nBudget level: ${body.budget}`;
                  if (body.pace) userContent += `\nTravel pace: ${body.pace}`;
                }
                systemPrompt = buildSystemPrompt({ dayCount: requestedDays, businesses: localBusinesses, catalogEntries: CATALOG_TITLES as any, isChat: false });
              }

              const messages: Array<{ role: string; content: string }> = isChatMode
                ? [{ role: 'system', content: systemPrompt }, ...sanitizedHistory, { role: 'user', content: userContent }]
                : [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }];

              const payload = JSON.stringify({ model, messages, temperature });

              const options = {
                hostname: 'generativelanguage.googleapis.com',
                path: '/v1beta/openai/chat/completions',
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(payload),
                },
              };

              const apiReq = https.request(options, (apiRes) => {
                let data = '';
                apiRes.on('data', (c) => { data += c; });
                apiRes.on('end', () => {
                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.message?.content || '';
                    if (!content) {
                      res.setHeader('Content-Type', 'application/json');
                      res.statusCode = apiRes.statusCode || 500;
                      res.end(data);
                      return;
                    }
                    let cleaned = content.trim();
                    const codeMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                    if (codeMatch) cleaned = codeMatch[1].trim();
                    const start = cleaned.indexOf('{');
                    const end = cleaned.lastIndexOf('}');
                    if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
                    const jsonResult = JSON.parse(cleaned);
                    const itineraryRaw = jsonResult.itinerary || (Array.isArray(jsonResult) ? jsonResult : null);
                    // Enforce allowlist so dev and prod both return only DB places
                    if (isChatMode) {
                      let text = content;
                      if (codeMatch) {
                        const beforeIdx = content.indexOf(codeMatch[0]);
                        text = beforeIdx > 0 ? content.slice(0, beforeIdx).trim() : '';
                      } else {
                        const braceIdx = content.indexOf('{');
                        if (braceIdx > 0) text = content.slice(0, braceIdx).trim();
                      }
                      if (Array.isArray(itineraryRaw) && itineraryRaw.length > 0) {
                        const _eff = (body as any).__effectiveDays ?? requestedDays;
                        const normalized = (itineraryRaw as any).slice(0, _eff).map((d: any, idx: number)=>({ day: idx+1, title: typeof d.title==="string"?d.title:`Day ${idx+1}`, stops: Array.isArray(d.stops)?d.stops.slice(0,4).map((s:any)=>({ time: typeof s.time==="string"?s.time:"9:00 AM", title: typeof s.title==="string"?s.title:"", note: typeof s.note==="string"?s.note:"", icon: typeof s.icon==="string"&&VALID_ICONS.has(s.icon)?s.icon:"explore"})):[] }));
                        const enforced = enforceAllowlist(normalized, allowlist);
                        const vW = viabilityWarnings(enforced.repaired as any, _eff, (body as any).__effectivePace || "Balanced");
                        const allW = [...enforced.warnings, ...vW];
                        res.setHeader('Content-Type', 'application/json');
                        res.statusCode = 200;
                        res.end(JSON.stringify({ text: text.slice(0, 4000) || `Here's your ${_eff}-day Albay itinerary, grounded in the app database.`, itinerary: enforced.repaired, grounded: true, warnings: allW, viability: { pace: (body as any).__effectivePace || "Balanced", budget: (body as any).__effectiveBudget || "Moderate", days: _eff, issues: vW }, generatedAt: new Date().toISOString(), model }));
                        return;
                      }
                      if (!itineraryRaw) {
                        res.setHeader('Content-Type', 'application/json');
                        res.statusCode = 200;
                        res.end(JSON.stringify({ text: String(content).slice(0, 4000), itinerary: null, grounded: false, warnings: ['The AI replied without a structured itinerary.'], generatedAt: new Date().toISOString(), model }));
                        return;
                      }
                    } else {
                      if (Array.isArray(itineraryRaw) && itineraryRaw.length > 0) {
                        const normalized = (itineraryRaw as any).slice(0, requestedDays).map((d: any, idx: number)=>({ day: idx+1, title: typeof d.title==="string"?d.title:`Day ${idx+1}`, stops: Array.isArray(d.stops)?d.stops.slice(0,4).map((s:any)=>({ time: typeof s.time==="string"?s.time:"9:00 AM", title: typeof s.title==="string"?s.title:"", note: typeof s.note==="string"?s.note:"", icon: typeof s.icon==="string"&&VALID_ICONS.has(s.icon)?s.icon:"explore"})):[] }));
                        const enforced = enforceAllowlist(normalized, allowlist);
                        res.setHeader('Content-Type', 'application/json');
                        res.statusCode = 200;
                        res.end(JSON.stringify({ itinerary: enforced.repaired, warnings: enforced.warnings, grounded: true, generatedAt: new Date().toISOString(), model }));
                        return;
                      }
                    }
                  } catch (err) {
                    console.error('[dev-itinerary-api] parse error', err);
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = apiRes.statusCode || 500;
                  res.end(data);
                });
              });

              apiReq.on('error', (err) => {
                console.error('[dev-itinerary-api] request error', err);
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 502;
                res.end(JSON.stringify({ error: err.message }));
              });

              apiReq.write(payload);
              apiReq.end();
            } catch (err: any) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 400;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devItineraryPlugin()],
  resolve: {
    alias: {
      '@/assets': fileURLToPath(new URL('./assets', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  root: rootDir,
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    hmr: { overlay: true },
    watch: { usePolling: false },
  },
  preview: { host: true, port: 5173 },
  build: {
    cssCodeSplit: true,
    chunkSizeWarningLimit: 700,
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('firebase')) return 'vendor-firebase';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('leaflet')) return 'vendor-leaflet';
          if (id.includes('qrcode')) return 'vendor-qrcode';
          if (id.includes('react')) return 'vendor-react';
          // exceljs is now dynamically imported — keep it separate if statically pulled
          if (id.includes('exceljs')) return 'vendor-exceljs';
        },
      },
    },
  },
});
