import {beforeEach,describe,it,expect,vi} from "vitest";
import sharp from "sharp";
import {OpenAI} from "openai";
import {BatchError,validWorkerSignature,workerSignature,safeObjectPath} from "../src/lib/generation-batch-service";
import {processGenerationBatchItem,generationBatchDeps,type BatchItemContext} from "../src/lib/generation-batch-process";

const school="00000000-0000-4000-8000-000000000001",item="00000000-0000-4000-8000-000000000002",lease="00000000-0000-4000-8000-000000000003";
let png:Buffer;
const context:BatchItemContext={school_id:school,student_id:item,source:"profile",source_path:`students/${school}/foto.png`,result_path:`${school}/generation-batches/lote/${item}/1.png`,prompt:"Arte do evento",provider_started:false};
beforeEach(async()=>{png=await sharp({create:{width:20,height:30,channels:3,background:"red"}}).png().toBuffer();});
function deps() {
  const rpc=vi.fn(async(name:string)=>name==="generation_batch_item_context"?context:name==="begin_generation_batch_item"?true:{status:"completed"});
  const read=vi.fn(async(bucket:string)=>bucket==="generated"?null:png);
  const put=vi.fn(async()=>{}),generate=vi.fn(async()=>png);
  return {rpc,read,put,generate};
}
describe("geração em lote sem serviços externos",()=>{
  it("HMAC recusa corpo adulterado, expirado e chave diferente",()=>{
    const body=JSON.stringify({itemId:item,leaseId:lease}),stamp=String(Date.now()),signature=workerSignature("local-synthetic",stamp,body);
    expect(validWorkerSignature("local-synthetic",stamp,signature,body)).toBe(true);
    expect(validWorkerSignature("local-synthetic",stamp,signature,body+" ")).toBe(false);
    expect(validWorkerSignature("other",stamp,signature,body)).toBe(false);
    expect(validWorkerSignature("local-synthetic",stamp,signature,body,Date.now()+61_000)).toBe(false);
  });
  it("recusa URL externa, traversal e caminho de outra escola",()=>{
    for(const path of ["https://external/photo.png",`${school}/../file.png`,`other/photo.png`])expect(()=>safeObjectPath(path,school,"students")).toThrow();
    expect(safeObjectPath(`students/${school}/foto.png`,school,"students")).toBe(`${school}/foto.png`);
  });
  it("gera uma vez e salva a arte somente após revalidar autorização",async()=>{
    const d=deps();expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:"completed"});
    expect(d.generate).toHaveBeenCalledTimes(1);expect(d.put).toHaveBeenCalledTimes(1);
    expect(d.rpc.mock.calls.map(c=>c[0])).toEqual(["generation_batch_item_context","begin_generation_batch_item","generation_batch_item_context","generation_batch_item_context","complete_generation_batch_item"]);
  });
  it("retenta falha de persistência com os mesmos bytes sem gerar outra vez",async()=>{
    const d=deps();d.put.mockRejectedValueOnce(new Error("storage temporary"));d.rpc.mockImplementation(async(name)=>{if(name==="generation_batch_item_context")return context;if(name==="begin_generation_batch_item")return true;if(name==="complete_generation_batch_item"&&d.rpc.mock.calls.filter(c=>c[0]===name).length===1)throw new Error("DB temporary");return {status:"completed"};});
    expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:"completed"});
    expect(d.generate).toHaveBeenCalledTimes(1);expect(d.put).toHaveBeenCalledTimes(2);
    expect(d.put.mock.calls[0]![1]).toEqual(d.put.mock.calls[1]![1]);
  });
  it("recupera objeto já salvo após queda sem nova chamada IA",async()=>{
    const d=deps();d.read.mockResolvedValue(png);d.rpc.mockImplementation(async(name)=>name==="generation_batch_item_context"?{...context,provider_started:true}:{status:"completed"});
    expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:"completed"});expect(d.generate).not.toHaveBeenCalled();
  });
  it("asset gravado por lease antigo solicita expurgo com fence sem nova IA",async()=>{
    const d=deps();d.read.mockResolvedValue(png);d.rpc.mockImplementation(async(name)=>name==="generation_batch_item_context"?{...context,provider_started:true}:name==="complete_generation_batch_item"?{status:"unavailable"}:true);
    expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:"unavailable"});
    expect(d.rpc).toHaveBeenCalledWith("discard_generation_batch_asset",{p_item_id:item,p_result_path:context.result_path});expect(d.generate).not.toHaveBeenCalled();
  });
  it("resultado ambíguo sem objeto torna unknown e nunca gera automaticamente",async()=>{
    const d=deps();d.rpc.mockImplementation(async(name)=>name==="generation_batch_item_context"?{...context,provider_started:true}:{status:"unknown"});
    expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:"unknown"});expect(d.generate).not.toHaveBeenCalled();
  });
  it("replay de lease não inicia segundo provedor",async()=>{
    const d=deps();d.rpc.mockImplementation(async(name)=>name==="generation_batch_item_context"?context:false);
    expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:"stale"});expect(d.generate).not.toHaveBeenCalled();
  });
  it("contexto revogado antes do provedor termina item sem geração",async()=>{
    const d=deps();d.rpc.mockImplementation(async(name)=>name==="generation_batch_item_context"?null:true);
    expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:"failed"});
    expect(d.rpc).toHaveBeenCalledWith("fail_generation_batch_item",expect.objectContaining({p_error_code:"authorization_changed",p_unknown:false}));expect(d.generate).not.toHaveBeenCalled();
  });
  it("revogação após provedor bloqueia armazenamento da imagem",async()=>{
    const d=deps();let calls=0;d.rpc.mockImplementation(async(name)=>name==="generation_batch_item_context"?(++calls===1?context:null):true);
    expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:"failed"});expect(d.put).not.toHaveBeenCalled();expect(d.generate).toHaveBeenCalledTimes(1);
  });
  it("erro de provedor não repete nem expõe mensagem sensível",async()=>{
    const d=deps();d.generate.mockRejectedValue(new Error("sensitive body"));
    expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:"unknown"});expect(d.generate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d.rpc.mock.calls)).not.toContain("sensitive body");
  });
  it("resultado inválido confirmado registra failed sem repetir provedor",async()=>{
    const d=deps();d.generate.mockRejectedValue(new BatchError("provider_result_invalid"));
    expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:"failed"});expect(d.generate).toHaveBeenCalledTimes(1);
  });
  it("rejeição HTTP confirmada vira failed, timeout HTTP continua unknown",async()=>{
    for(const status of [400,408]) {
      const d=deps();d.generate.mockRejectedValue(new OpenAI.APIError(status,{message:"sensitive provider body"},"private detail",new Headers()));
      expect(await processGenerationBatchItem(item,lease,d as typeof generationBatchDeps)).toEqual({status:status===400?"failed":"unknown"});
      expect(d.generate).toHaveBeenCalledTimes(1);expect(JSON.stringify(d.rpc.mock.calls)).not.toContain("sensitive provider body");
    }
  });
});
