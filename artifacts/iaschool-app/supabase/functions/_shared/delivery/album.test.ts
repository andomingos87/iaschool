import { ALBUM_COOKIE, makeAlbumHandler, remainingTtl } from "./album.ts";
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("assertion failed"); };
const now = Date.parse("2026-10-12T00:00:00Z");
const itemId = "10000000-0000-0000-0000-000000000001";
const secret = "a".repeat(64);
const snapshot = { fields: {eventName:"Evento",signature:"Escola"}, sessionExpiresAt: new Date(now+86400000).toISOString(), items:[{id:itemId,photoId:itemId,order:0,assetPath:"private.jpg",thumbPath:"private.webp",width:200,height:150,retentionUntil:new Date(now+7000).toISOString()}] };
const request = (body: unknown, cookie = false) => new Request("https://school.test/api/guardian-album", {method:"POST",headers:{"Content-Type":"application/json",...(cookie?{Cookie:`${ALBUM_COOKIE}=${secret}`}:{})},body:JSON.stringify(body)});
Deno.test("assinatura limitada pela sessão, retenção e 5 minutos", () => {
 eq(remainingTtl(new Date(now+86400000).toISOString(),new Date(now+7000).toISOString(),now),7);
 eq(remainingTtl(new Date(now+600000).toISOString(),new Date(now+86400000).toISOString(),now),300);
 eq(remainingTtl(new Date(now-1).toISOString(),new Date(now+86400000).toISOString(),now),0);
});
Deno.test("consume emite cookie HttpOnly e não devolve caminhos/segredos",async()=>{
 const calls:string[]=[];
 const handler=makeAlbumHandler({now:()=>now,rpc:async name=>{calls.push(name);return {data:name==='consume_delivery_album_token'?{ok:true,expiresAt:new Date(now+86400000).toISOString()}:snapshot,error:null};},sign:async(_path,ttl)=>{eq(ttl,7);return 'https://signed.test/file';}});
 const response=await handler(request({action:'consume',token:secret}));
 eq(response.status,200);const body=JSON.stringify(await response.json());
 if(body.includes('private.jpg')||body.includes(secret))throw new Error('segredo exposto');
 const cookie=response.headers.get('Set-Cookie')??'';
 for(const flag of ['HttpOnly','Secure','SameSite=Lax','Max-Age=86400'])if(!cookie.includes(flag))throw new Error('cookie inseguro');
 eq(calls.filter(x=>x==='consume_delivery_album_token').length,1);
});
Deno.test("sessão existente não consome token nem renova cookie",async()=>{
 let consumed=false;
 const handler=makeAlbumHandler({now:()=>now,rpc:async name=>{if(name==='consume_delivery_album_token')consumed=true;return {data:name==='delivery_album_token_session'?true:snapshot,error:null};},sign:async()=>"https://signed.test/file"});
 const response=await handler(request({action:'consume',token:secret},true));eq(response.status,200);eq(consumed,false);eq(response.headers.get('Set-Cookie'),null);
});
Deno.test("revogação concorrente depois da assinatura recusa URL",async()=>{
 let calls=0;
 const handler=makeAlbumHandler({now:()=>now,rpc:async()=>({data:++calls===1?snapshot:{error:'revoked'},error:null}),sign:async()=>"https://signed.test/file"});
 const response=await handler(request({action:'list'},true));eq(response.status,410);eq(await response.json(),{error:'revoked'});
});
Deno.test("token usado/expirado e foto externa não assinam",async()=>{
 let signed=false;
 const handler=makeAlbumHandler({now:()=>now,rpc:async name=>({data:{error:name==='consume_delivery_album_token'?'used':'unavailable'},error:null}),sign:async()=>{signed=true;return null;}});
 eq((await handler(request({action:'consume',token:secret}))).status,410);
 eq((await handler(request({action:'download',itemId},true))).status,410);eq(signed,false);
});

Deno.test("sessão de outro álbum não captura o novo link",async()=>{
 let consumed=false;
 const handler=makeAlbumHandler({now:()=>now,rpc:async name=>{if(name==='consume_delivery_album_token')consumed=true;return {data:name==='delivery_album_token_session'?false:name==='consume_delivery_album_token'?{ok:true,expiresAt:new Date(now+86400000).toISOString()}:snapshot,error:null};},sign:async()=>"https://signed.test/file"});
 const response=await handler(request({action:'consume',token:secret},true));eq(response.status,200);eq(consumed,true);
 if(!response.headers.get('Set-Cookie'))throw new Error('nova sessão ausente');
});

Deno.test("segunda abertura sem cookie devolve os dois eventos e não recusa como usado",async()=>{
 const eventA="20000000-0000-0000-0000-000000000001";
 const eventB="20000000-0000-0000-0000-000000000002";
 const itemB="10000000-0000-0000-0000-000000000002";
 const multi={...snapshot,items:[
  {...snapshot.items[0],eventId:eventA,eventName:"Teste"},
  {id:itemB,photoId:itemB,order:0,assetPath:"private-b.jpg",thumbPath:"private-b.webp",width:200,height:150,retentionUntil:snapshot.items[0].retentionUntil,eventId:eventB,eventName:"Festa dois",studentIds:["aluno"]},
 ]};
 let consumes=0;
 const handler=makeAlbumHandler({now:()=>now,rpc:async name=>{
  if(name==="consume_delivery_album_token")consumes+=1;
  return {data:name==="consume_delivery_album_token"?{ok:true,expiresAt:new Date(now+86400000).toISOString()}:multi,error:null};
 },sign:async()=>"https://signed.test/file"});
 const first=await handler(request({action:"consume",token:secret}));
 const second=await handler(request({action:"consume",token:"b".repeat(64)}));
 eq(first.status,200);eq(second.status,200);eq(consumes,2);
 const body=await second.json() as {items:{eventId:string;eventName:string}[]};
 const text=JSON.stringify(body);
 if(text.includes("used")||text.includes("private")||text.includes("aluno"))throw new Error("resposta indevida");
 eq(body.items.map(item=>item.eventName).sort(),["Festa dois","Teste"]);
 eq(body.items.map(item=>item.eventId).sort(),[eventA,eventB]);
});
Deno.test("falha ao assinar depois do consumo mantém cookie para retornar à sessão",async()=>{
 const handler=makeAlbumHandler({now:()=>now,rpc:async name=>({data:name==='consume_delivery_album_token'?{ok:true,expiresAt:new Date(now+86400000).toISOString()}:snapshot,error:null}),sign:async()=>null});
 const response=await handler(request({action:'consume',token:secret}));eq(response.status,503);
 if(!response.headers.get('Set-Cookie')?.includes('HttpOnly'))throw new Error('sessão perdida');
});
