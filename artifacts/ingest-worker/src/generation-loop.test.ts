import {describe,it,expect,vi} from "vitest";
import {makeGenerationLoopDeps,startGenerationLoop} from "./generation-loop";
import type {WorkerClient} from "./supabase";

describe("fila de geração servidor",()=>{
  it("continua outros alunos após falha e não repete requisição",async()=>{
    const jobs=[{id:"one",lease_id:"lease-one",attempt:1},{id:"two",lease_id:"lease-two",attempt:1}];
    const process=vi.fn(async(job)=>{if(job.id==="one")throw new Error("unknown");});
    let loop:ReturnType<typeof startGenerationLoop>;
    const sleep=vi.fn(async()=>{void loop.stop();});
    loop=startGenerationLoop({claim:async()=>jobs,process,sleep});
    await new Promise(resolve=>setTimeout(resolve,10));await loop.stop();
    expect(process.mock.calls.map(c=>c[0].id)).toEqual(["one","two"]);
  });
  it("claim exclusivo, HMAC e timeout sem retry de transporte",async()=>{
    const rpc=vi.fn().mockResolvedValue({data:[{id:"item",lease_id:"lease",attempt:1}],error:null});
    const fetcher=vi.fn().mockRejectedValue(new Error("network"));
    const d=makeGenerationLoopDeps({rpc} as unknown as WorkerClient,"synthetic-key","https://iaschool-api.fly.dev",fetcher);
    const jobs=await d.claim();await expect(d.process(jobs[0]!)).rejects.toThrow("network");
    expect(rpc).toHaveBeenCalledWith("claim_generation_batch_items",{p_limit:1,p_lease_seconds:600});expect(fetcher).toHaveBeenCalledTimes(1);
    const [url,options]=fetcher.mock.calls[0]!;expect(url).toContain("/api/generation/batches/internal/process");expect(options.headers["x-iaschool-signature"]).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(options)).not.toContain("synthetic-key");
  });
  it("recusa API interna sem TLS ou com credenciais na URL",()=>{
    for(const url of ["http://api.test","https://user:secret@api.test"])expect(()=>makeGenerationLoopDeps({} as WorkerClient,"key",url)).toThrow();
  });
});
