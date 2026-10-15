import { dispatchDelivery } from './dispatch.ts';
import { FakeWhatsAppProvider } from '../whatsapp/fake-provider.ts';
import { renderDeliveryMessage, validateDeliveryFields } from './message.ts';
const eq=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('assertion failed');};
const fields={eventName:'Festa',callToAction:'Veja as fotos',signature:'Escola'};
Deno.test('limites do contrato e URL editável rejeitada',()=>{
 eq(validateDeliveryFields(fields),true);eq(validateDeliveryFields({...fields,eventName:'x'.repeat(121)}),false);
 eq(validateDeliveryFields({...fields,callToAction:'https://evil.test'}),false);eq(validateDeliveryFields({...fields,signature:'x'.repeat(81)}),false);
 eq(validateDeliveryFields({...fields,callToAction:''}),true);
});
Deno.test('fluxo falso manda somente texto + link opaco, aceitação não entrega',async()=>{
 const provider=new FakeWhatsAppProvider();const calls:string[]=[];
 const result=await dispatchDelivery({userId:'u',mode:'controlled_zapi',publicUrl:'https://school.test',instanceId:'i',albumReady:true,provider,
 rpc:async(name)=>{calls.push(name);return {data:name==='reserve_delivery_dispatch'?{messageId:'m',phone:'+5511999999999',fields}:true,error:null};}},'r',false);
 eq(result,{ok:true,status:'accepted'});eq(provider.sent.length,1);
 if(!provider.sent[0].text.includes('/album#')||provider.sent[0].text.includes('student'))throw new Error('template inválido');
 eq(calls,['reserve_delivery_dispatch','delivery_dispatch_gate','complete_whatsapp_send']);
});
Deno.test('modo pausado, álbum indisponível e portão fechado não transmitem',async()=>{
 const provider=new FakeWhatsAppProvider();
 const deps={userId:'u',mode:'paused',publicUrl:'https://school.test',instanceId:'i',albumReady:true,provider,rpc:async(name:string)=>({data:name==='reserve_delivery_dispatch'?{messageId:'m',phone:'+5511999999999',fields}:false,error:null})};
 eq((await dispatchDelivery(deps,'r',false)).code,'sending_disabled');
 eq((await dispatchDelivery({...deps,mode:'controlled_zapi',albumReady:false},'r',false)).code,'sending_disabled');
 eq((await dispatchDelivery({...deps,mode:'controlled_zapi'},'r',false)).code,'dispatch_blocked');eq(provider.sent.length,0);
});
Deno.test('timeout permanece incerto sem segunda transmissão',async()=>{
 let sent=0; const provider=new FakeWhatsAppProvider();provider.sendDeliveryReady=()=>{sent++;return Promise.reject(new Error('secret url'));};
 const result=await dispatchDelivery({userId:'u',mode:'controlled_zapi',publicUrl:'https://school.test',instanceId:'i',albumReady:true,provider,
 rpc:async(name)=>({data:name==='reserve_delivery_dispatch'?{messageId:'m',phone:'+5511999999999',fields}:true,error:null})},'r',false);
 eq(result,{ok:true,status:'unknown'});eq(sent,1);
});
Deno.test('template não aceita link fora do HTTPS album e não expõe nome aluno',()=>{
 try{renderDeliveryMessage(fields,'https://evil.test/arbitrary');throw new Error('accepted');}catch(e){if((e as Error).message==='accepted')throw e;}
});
