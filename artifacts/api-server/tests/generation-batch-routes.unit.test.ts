import {beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("../src/middlewares/supabase-auth",()=>({requireSupabaseUser:vi.fn()}));
import router,{generationBatchRoutesDeps as deps} from "../src/routes/generation-batches";
import {BatchError} from "../src/lib/generation-batch-service";
const school="00000000-0000-4000-8000-000000000001",student="00000000-0000-4000-8000-000000000002",requestId="00000000-0000-4000-8000-000000000003";
const snapshot={id:requestId,schoolId:school,status:"pending",prompt:"Arte escolar",total:1,completed:0,failed:0,items:[]};
let rpc:ReturnType<typeof vi.fn>,sign:ReturnType<typeof vi.fn>;
beforeEach(()=>{rpc=vi.fn().mockResolvedValue(snapshot);sign=vi.fn().mockResolvedValue("https://signed.test/image");deps.rpc=rpc as typeof deps.rpc;deps.sign=sign as typeof deps.sign;});
async function call(path:string,method:string,body={},query={},params={}) {
  const layer=router.stack.find((l:{route?:{path:string;methods:Record<string,boolean>}})=>l.route?.path===path&&l.route.methods[method]);
  let status=200,response:unknown;const res={status(code:number){status=code;return this;},json(value:unknown){response=value;return this;}};
  await layer.route.stack.at(-1).handle({body,query,params,supabaseUserId:student,headers:{authorization:"Bearer synthetic-user-token"}},res);
  return {status,response};
}
describe("contrato público lote sem HTTP/banco",()=>{
  it("encaminha seleção por IDs com JWT usuário e não aceita URLs cliente",async()=>{
    const result=await call("/generation/batches","post",{requestId,schoolId:school,prompt:"Arte escolar",students:[{studentId:student,photo:{source:"profile",id:"principal"}}]});
    expect(result.status).toBe(201);expect(rpc).toHaveBeenCalledWith("create_generation_batch",{p_school_id:school,p_request_id:requestId,p_prompt:"Arte escolar",p_students:[{studentId:student,source:"profile",photoId:"principal"}]},"synthetic-user-token");
  });
  it("bloqueia alunos duplicados e requestId ausente antes do banco",async()=>{
    const entry={studentId:student,photo:{source:"profile",id:"foto"}};
    expect((await call("/generation/batches","post",{schoolId:school,requestId,prompt:"Arte",students:[entry,entry]})).status).toBe(400);
    expect((await call("/generation/batches","post",{schoolId:school,prompt:"Arte",students:[entry]})).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  });
  it("retorna erro de quota seguro sem mensagem do banco",async()=>{
    rpc.mockRejectedValue(new BatchError("quota_exceeded",409));
    const result=await call("/generation/batches/eligibility","get",{},{schoolId:school});expect(result.status).toBe(409);expect(result.response).toMatchObject({code:"quota_exceeded"});
  });
  it("remove resultPath privado e assina apenas resultado completed",async()=>{
    rpc.mockResolvedValue({...snapshot,items:[{id:requestId,studentId:student,status:"completed",photo:{source:"profile",id:"foto"},resultPath:`${school}/generation-batches/result.png`,postId:student},{id:school,studentId:student,status:"failed",photo:{source:"profile",id:"foto"},resultPath:`${school}/bad.png`}]});
    const result=await call("/generation/batches/:id","get",{},{},{id:requestId});expect(result.status).toBe(200);expect(sign).toHaveBeenCalledTimes(1);expect(JSON.stringify(result.response)).not.toContain("resultPath");expect(JSON.stringify(result.response)).not.toContain("bad.png");
  });
  it("foto modal remove path e assina somente escolhas autorizadas RPC",async()=>{
    rpc.mockResolvedValue({schoolId:school,photos:[{id:"perfil",source:"profile",path:`students/${school}/foto.png`}]});
    const result=await call("/generation/batches/photos","get",{},{studentId:student});expect(result.response).toEqual({photos:[{id:"perfil",source:"profile",url:"https://signed.test/image"}]});expect(sign).toHaveBeenCalledWith("students",`${school}/foto.png`);
  });
  it("rota interna nega assinatura ausente antes de processar",async()=>{
    vi.stubEnv("SUPABASE_URL","https://synthetic.test");vi.stubEnv("SUPABASE_ANON_KEY","synthetic");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","synthetic-service");
    const process=vi.spyOn(deps,"process");const result=await call("/generation/batches/internal/process","post",{itemId:student,leaseId:requestId});expect(result.status).toBe(403);expect(process).not.toHaveBeenCalled();process.mockRestore();vi.unstubAllEnvs();
  });
});
