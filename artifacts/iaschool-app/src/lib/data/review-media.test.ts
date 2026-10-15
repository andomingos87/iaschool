import { describe, expect, it, vi } from "vitest";
import { createMockReviewMediaRepository, createReviewMediaRepository, regionValidationError, type PersonRegion } from "./review-media";
import type { SupabaseClient } from "@supabase/supabase-js";
const region: PersonRegion = { face_id: null, student_id: null, kind: "protected_unknown", shape: "rect", points: [0,0,30,40] };
describe("revisão da pessoa inteira", () => {
  it("aceita retângulo na borda e recusa dimensões inválidas/fora da foto", () => {
    expect(regionValidationError(region,30,40)).toBeNull();
    expect(regionValidationError({...region,points:[0,0,31,40]},30,40)).toBeTruthy();
    expect(regionValidationError({...region,points:[0,0,NaN,40]},30,40)).toBeTruthy();
    expect(regionValidationError({...region,points:[0,0,0,40]},30,40)).toBeTruthy();
  });
  it("recusa polígono cruzado, vazio e fora dos limites", () => {
    expect(regionValidationError({...region,shape:"polygon",points:[[0,0],[30,0],[30,40],[0,40]]},30,40)).toBeNull();
    for (const points of [[[0,0],[30,40],[0,40],[30,0]],[[0,0],[0,0],[20,20]],[[0,0],[30,0],[31,40]]]) expect(regionValidationError({...region,shape:"polygon",points},30,40)).toBeTruthy();
  });
  it("demonstração mantém pendência e recusa versão atrasada", async () => {
    const repo=createMockReviewMediaRepository();
    const saved=await repo.savePhotoReview({photoId:"a",expectedVersion:0,width:800,height:600,regions:[region],allPeopleReviewed:false});
    expect(saved.all_people_reviewed).toBe(false);expect(saved.reviewed_version).toBeNull();
    await expect(repo.savePhotoReview({photoId:"a",expectedVersion:0,width:800,height:600,regions:[region],allPeopleReviewed:true})).rejects.toThrow("mudou");
    const reviewed=await repo.savePhotoReview({photoId:"a",expectedVersion:1,width:800,height:600,regions:[region],allPeopleReviewed:true});
    expect(reviewed.reviewed_version).toBe(2);
    expect((await repo.photoReview("b")).regions).toEqual([]);
  });
  it("salva expected-version, dimensões e regiões sem ID anterior", async () => {
    const rpc=vi.fn().mockResolvedValue({data:{storage_path:"test",regions:[]},error:null});
    const sign=vi.fn().mockResolvedValue({data:{signedUrl:"signed"},error:null});
    const client={rpc,storage:{from:()=>({createSignedUrl:sign})}} as unknown as SupabaseClient;
    await createReviewMediaRepository(client).savePhotoReview({photoId:"p",expectedVersion:3,width:30,height:40,regions:[{...region,id:"old"}],allPeopleReviewed:true});
    expect(rpc).toHaveBeenCalledWith("save_photo_person_review",{p_photo_id:"p",p_expected_version:3,p_width:30,p_height:40,p_regions:[region],p_all_people_reviewed:true});
  });
  it("erro de assinatura não oferece URL do original como fallback", async () => {
    const client={rpc:async()=>({data:[{storage_path:"x",photo_id:"p"}],error:null}),storage:{from:()=>({createSignedUrl:async()=>({error:new Error("offline"),data:null})})}} as unknown as SupabaseClient;
    expect((await createReviewMediaRepository(client).referenceCandidates("s"))[0]?.imageUrl).toBeUndefined();
  });
});
