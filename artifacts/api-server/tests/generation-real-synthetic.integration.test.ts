/** Opt-in, paid smoke: exactly ONE deployed generation, never an automatic retry.
 * Uses synthetic images and a disposable school account, not QA credentials.
 * Does not read OPENAI_API_KEY: the deployed API uses its existing server key.
 * Activate only after an explicit new authorization for one real generation:
 * IASCHOOL_RUN_REAL_IMAGE_SMOKE=approved_single_synthetic_generation
 * IASCHOOL_REAL_IMAGE_URL=https://iaschool-app.vercel.app
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { adminRest, adminUpdateProfile, cleanupTestData, createTestUser, envReady, SUPABASE_URL, testUserExists, type TestUser } from "./supabase-test-utils";

const enabled = process.env["IASCHOOL_RUN_REAL_IMAGE_SMOKE"] === "approved_single_synthetic_generation";
const allowedOrigins = new Set(["https://iaschool-app.vercel.app", "https://iaschool-api.fly.dev"]);
const createdUsers: string[] = [];
let user: TestUser | undefined;
let origin = "";
let requests = 0;
let requestStarted = false;
let returnedLogId: string | null = null;

async function requireEmpty(table: string, query: string): Promise<void> {
  const response = await adminRest(`${table}?${query}&select=id`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Falha ao conferir limpeza de ${table}: HTTP ${response.status}.`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length) throw new Error(`Resíduo da fixture em ${table}.`);
}
async function cleanupFixture(): Promise<void> {
  // The deployed audit is asynchronous and has no user FK. Observe/settle it
  // before cleanup; deleting Auth alone would not prevent a late log write.
  const failures: string[] = [];
  if (requestStarted) {
    try { await observedAudit(); } catch { failures.push("audit not observed before cleanup"); }
  }
  try { await cleanupTestData({ users: createdUsers }); } catch { failures.push("escola/conta"); }
  for (const id of createdUsers) {
    try { if (await testUserExists(id)) failures.push("auth account verification"); } catch { failures.push("auth account verification"); }
    for (const table of ["generation_logs", "generation_usage"]) {
      try {
        const deleted = await adminRest(`${table}?user_id=eq.${id}`, {method:"DELETE",signal:AbortSignal.timeout(15_000)});
        if (!deleted.ok) throw new Error("delete failed");
      } catch { failures.push(table); }
    }
    for (const table of ["profiles", "schools"]) {
      try { await requireEmpty(table,`id=eq.${id}`); } catch { failures.push(table); }
    }
    for (const table of ["generation_logs", "generation_usage"]) {
      try {
        const response = await adminRest(`${table}?user_id=eq.${id}&select=user_id`, {signal:AbortSignal.timeout(15_000)});
        if (!response.ok || ((await response.json()) as unknown[]).length) throw new Error("residue");
      } catch { failures.push(`${table} verification`); }
    }
  }
  if (failures.length) throw new Error(`Limpeza da fixture incompleta: ${[...new Set(failures)].join(", ")}.`);
}

async function observedAudit(): Promise<Record<string,unknown>> {
  const id = createdUsers[0];
  if (!id) throw new Error("Fixture sem conta registrada.");
  const deadline = Date.now()+35_000;
  do {
    const response = await adminRest(`generation_logs?user_id=eq.${id}&select=prompt,student_name,payload,attachments,result_thumb_path,openai_response,status`,{signal:AbortSignal.timeout(5_000)});
    if (response.ok) {
      const rows: unknown = await response.json();
      if (Array.isArray(rows) && rows.length === 1) return rows[0] as Record<string,unknown>;
      if (Array.isArray(rows) && rows.length > 1) throw new Error("Mais de uma geração na fixture de orçamento único.");
    }
    await new Promise(resolve => setTimeout(resolve,250));
  } while (Date.now()<deadline);
  throw new Error("Auditoria assíncrona não confirmada; não repetir a geração.");
}

describe.skipIf(!enabled)("geração real única com material sintético", () => {
  beforeAll(async () => {
    if (!envReady() || new URL(SUPABASE_URL).hostname !== "jtyyauivokutperouqyh.supabase.co") throw new Error("Fixture exige o Supabase próprio do IAschool configurado.");
    const configured = process.env["IASCHOOL_REAL_IMAGE_URL"] ?? "https://iaschool-app.vercel.app";
    origin = new URL(configured).origin;
    if (!allowedOrigins.has(origin) || configured !== origin) throw new Error("Use somente a origem HTTPS publicada do IAschool.");
    user = await createTestUser({label:`real-synthetic-${randomUUID()}`,signupRole:"school",schoolName:"Escola sintética descartável — geração",onCreated:id => createdUsers.push(id)});
    await adminUpdateProfile(user.id,{approval_status:"approved"});
  },60_000);

  afterAll(async () => { await cleanupFixture(); },90_000);

  it("preserva pessoa sintética pixel a pixel e devolve PNG1024 numa única tentativa", async () => {
    const original = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#f7fafc"/><ellipse cx="160" cy="85" rx="58" ry="60" fill="#4a3025"/><ellipse cx="160" cy="105" rx="50" ry="58" fill="#e9bc93"/><circle cx="140" cy="102" r="5" fill="#152433"/><circle cx="180" cy="102" r="5" fill="#152433"/><path d="M142 130 Q160 145 178 130" fill="none" stroke="#6e2833" stroke-width="5"/><rect x="142" y="157" width="36" height="45" fill="#e9bc93"/><path d="M90 190 L230 190 L255 335 L65 335 Z" fill="#238553"/><path d="M65 335 L145 335 L140 438 L83 438 Z M175 335 L255 335 L237 438 L180 438 Z" fill="#234d89"/></svg>')).ensureAlpha().png().toBuffer();
    const reference = await sharp({create:{width:1024,height:1024,channels:4,background:{r:40,g:59,b:107,alpha:1}}}).png().toBuffer();
    const composition = {version:"original-pixels-v1",photoId:"synthetic-only",reviewed:true,
      points:[{x:70/320,y:10/480},{x:250/320,y:10/480},{x:250/320,y:180/480},{x:280/320,y:210/480},{x:280/320,y:460/480},{x:40/320,y:460/480},{x:40/320,y:210/480},{x:70/320,y:180/480}],
      protectedHead:{x:80/320,y:20/480,width:160/320,height:192/480}};
    const form = new FormData();
    form.append("prompt","Crie apenas um fundo geométrico escolar discreto 1024x1024, sem texto, sem logo e sem nenhuma pessoa. Use tons de azul da referência. Reserve o centro vazio.");
    form.append("composition",JSON.stringify(composition));
    form.append("meta",JSON.stringify({templateSource:"fallback",template:"single-synthetic-smoke-v1",compositionVersion:composition.version}));
    form.append("images",new Blob([new Uint8Array(reference)],{type:"image/png"}),"modelo-sintetico.png");
    form.append("images",new Blob([new Uint8Array(original)],{type:"image/png"}),"pessoa-sintetica.png");
    if (requests !== 0) throw new Error("Orçamento de uma tentativa já consumido; não repetir automaticamente.");
    requests += 1; requestStarted = true;
    const response = await fetch(`${origin}/api/generation/post-image`,{method:"POST",headers:{Authorization:`Bearer ${user!.token}`},body:form,redirect:"error",signal:AbortSignal.timeout(210_000)});
    if (!response.ok) {
      let providerCode="not_confirmed";
      try {
        const log=await observedAudit();const provider=log.openai_response as Record<string,unknown> | null;
        const code=provider?.["code"];
        if (typeof code==="string" && /^[a-z0-9_-]{1,80}$/i.test(code)) providerCode=code;
      } catch { /* A failed request never authorizes another generation. */ }
      throw new Error(`A única geração autorizada falhou: HTTP ${response.status}; código do provedor ${providerCode}. Não será repetida.`);
    }
    const body: unknown = await response.json();
    const result = body as {imageUrl?:unknown;logId?:unknown};
    if (typeof result.imageUrl !== "string" || !result.imageUrl.startsWith("data:image/png;base64,")) throw new Error("Resposta da geração não contém PNG válido.");
    if (typeof result.logId === "string") returnedLogId=result.logId;
    const output = Buffer.from(result.imageUrl.slice("data:image/png;base64,".length),"base64");
    const meta = await sharp(output).metadata(); expect(meta.width).toBe(1024);expect(meta.height).toBe(1024);
    const originalPixels = await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const outputPixels = await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    // Crop extents 40..280 × 10..460: 240 × 450, centered without enlargement.
    // Original origin therefore maps to (352,277) in the composed output.
    const offsetX=352,offsetY=277;
    let exact=0;
    for(let y=25;y<180;y++) for(let x=100;x<220;x++) {
      const a=(y*320+x)*4,b=((y+offsetY)*1024+x+offsetX)*4;
      if (!originalPixels.data.subarray(a,a+4).equals(outputPixels.data.subarray(b,b+4))) throw new Error("Pixels da região protegida foram alterados na geração real.");
      exact += 1;
    }
    expect(exact).toBe(18_600); expect(requests).toBe(1);expect(requestStarted).toBe(true);
    const quota=await adminRest(`generation_usage?user_id=eq.${user!.id}&select=count`,{signal:AbortSignal.timeout(15_000)});
    if(!quota.ok) throw new Error("Geração retornou, mas não foi possível conferir a cota.");
    const quotaRows=await quota.json() as {count:number}[];
    if(quotaRows.length!==1 || quotaRows[0]!.count!==1) throw new Error("A cota da fixture não corresponde a uma única geração.");
    // Sanitized audit only; never print output/base64 or credentials on failure.
    if (!returnedLogId) throw new Error("Geração real retornou sem identificação de auditoria.");
    const audit = await observedAudit();
    expect(audit.prompt).toBeNull();expect(audit.student_name).toBeNull();expect(audit.result_thumb_path).toBeNull();
    if ((audit.payload as Record<string,unknown>).size !== "1024x1024") throw new Error("Tamanho de auditoria divergente.");
    if ((audit.attachments as {thumbPath?:unknown}[]).some(att=>att.thumbPath)) throw new Error("A geração sintética deixou miniatura indevida no log.");

  },250_000);
});
