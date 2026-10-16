-- Álbum do responsável com link reutilizável (MVP).
-- Referência somente. Não aplicar no projeto remoto sem autorização.
-- Ordem: fase5-adjustments-delivery-album.sql, depois este arquivo.
-- O token no fragmento deixa de ser uso único. used_at marca a primeira
-- abertura e não bloqueia a próxima. A sessão de 24 h continua no cookie;
-- abrir o mesmo link sem cookie cria outra sessão, sem renovar a anterior.
-- O conjunto é o que ainda passa no portão do responsável, em todos os
-- eventos da mesma escola. Revogação, autorização retirada e item de outra
-- família continuam negados. expires_at do token não encerra o acesso
-- enquanto houver foto aprovada disponível. OTP fica para depois do contrato.
-- A URL assinada continua limitada a 5 minutos no handler.

create or replace function public.consume_delivery_album_token(p_token_hash text,p_session_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t public.delivery_album_tokens%rowtype; r public.delivery_recipients%rowtype; b public.delivery_batches%rowtype; reason text; exp timestamptz;
begin
 if p_session_hash !~ '^[0-9a-f]{64}$' or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','unavailable'); end if;
 select * into t from public.delivery_album_tokens where token_hash=p_token_hash;
 if t.id is null then return jsonb_build_object('error','unavailable'); end if;
 select * into r from public.delivery_recipients where id=t.recipient_id;
 select * into b from public.delivery_batches where id=r.batch_id for update;
 perform 1 from public.delivery_recipients where id=r.id for update;
 select * into t from public.delivery_album_tokens where id=t.id for update;
 if t.revoked_at is not null then return jsonb_build_object('error','revoked'); end if;
 reason:=public.delivery_recipient_gate(r.id,true);
 if reason in ('revoked','authorization_revoked') then return jsonb_build_object('error',reason); end if;
 if reason is not null and not exists(select 1 from public.delivery_recipients r2
  where r2.school_id=r.school_id and r2.guardian_id=r.guardian_id and public.delivery_recipient_gate(r2.id,true) is null) then
  return jsonb_build_object('error',coalesce(reason,'unavailable'));
 end if;
 insert into public.delivery_access_sessions(recipient_id,session_hash,expires_at,approval_version)
 values(r.id,p_session_hash,now()+interval '24 hours',b.approved_version)
 on conflict (session_hash) do nothing;
 select expires_at into exp from public.delivery_access_sessions
  where session_hash=p_session_hash and recipient_id=r.id and revoked_at is null and expires_at>now();
 if exp is null then return jsonb_build_object('error','unavailable'); end if;
 if t.used_at is null then
  update public.delivery_album_tokens set used_at=now() where id=t.id;
  insert into public.delivery_events(school_id,batch_id,recipient_id,event_type,detail)
  values(r.school_id,r.batch_id,r.id,'access_opened',jsonb_build_object('version',b.approved_version));
 end if;
 return jsonb_build_object('ok',true,'expiresAt',exp);
end $$;
revoke all on function public.consume_delivery_album_token(text,text) from public,anon,authenticated;
grant execute on function public.consume_delivery_album_token(text,text) to service_role;

create or replace function public.delivery_album_session(p_session_hash text,p_item_id uuid default null,p_download boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.delivery_access_sessions%rowtype; r public.delivery_recipients%rowtype; a public.delivery_approvals%rowtype; reason text; items jsonb;
begin
 select * into s from public.delivery_access_sessions where session_hash=p_session_hash;
 if s.id is null then return jsonb_build_object('error','unavailable'); end if;
 select * into r from public.delivery_recipients where id=s.recipient_id;
 perform 1 from public.delivery_batches where id=r.batch_id for update;
 perform 1 from public.delivery_recipients where id=r.id for update;
 select * into s from public.delivery_access_sessions where id=s.id;
 if s.revoked_at is not null then return jsonb_build_object('error','revoked'); end if;
 if s.expires_at<=now() then return jsonb_build_object('error','expired'); end if;
 if s.approval_version is distinct from (select approved_version from public.delivery_batches where id=r.batch_id) then return jsonb_build_object('error','approval_required'); end if;
 reason:=public.delivery_recipient_gate(r.id,true);
 if reason in ('revoked','authorization_revoked') then return jsonb_build_object('error',reason); end if;
 select * into a from public.delivery_approvals where recipient_id=r.id and version=s.approval_version;
 select coalesce(jsonb_agg((x - 'studentIds') || jsonb_build_object(
   'eventId', eligible.event_id,
   'eventName', left(coalesce(nullif(btrim(eligible.event_name),''),'Evento'),120))
   order by coalesce(nullif(btrim(eligible.event_name),''),'Evento'), (x->>'order')::int, x->>'id'), '[]'::jsonb)
  into items
 from (
   select r2.id, r2.event_id, coalesce(nullif(btrim(ap.fields->>'eventName'),''), ev.name) as event_name, ap.items
   from public.delivery_recipients r2
   join public.delivery_batches b2 on b2.id=r2.batch_id
   join public.events ev on ev.id=r2.event_id
   join public.delivery_approvals ap on ap.recipient_id=r2.id and ap.version=b2.approved_version
   where r2.school_id=r.school_id and r2.guardian_id=r.guardian_id
     and public.delivery_recipient_gate(r2.id,true) is null
 ) eligible
 cross join lateral jsonb_array_elements(eligible.items) x
 where p_item_id is null or (x->>'id')::uuid=p_item_id;
 if p_item_id is not null and jsonb_array_length(items)=0 then return jsonb_build_object('error','unavailable'); end if;
 if jsonb_array_length(items)=0 then return jsonb_build_object('error',coalesce(reason,'unavailable')); end if;
 if exists(select 1 from jsonb_array_elements(items) x join public.delivery_items i on i.id=(x->>'id')::uuid
  where i.asset_hash is distinct from x->>'assetHash' or i.asset_path is distinct from x->>'assetPath') then
  return jsonb_build_object('error','unavailable'); end if;
 update public.delivery_access_sessions set last_accessed_at=now() where id=s.id;
 if p_download and p_item_id is not null then
  insert into public.delivery_events(school_id,batch_id,recipient_id,item_id,event_type,detail)
  values(r.school_id,r.batch_id,r.id,p_item_id,'photo_downloaded',jsonb_build_object('phase','url_issued'));
 end if;
 if a.recipient_id is null then return jsonb_build_object('error','unavailable'); end if;
 return jsonb_build_object('fields',a.fields,'items',items,'sessionExpiresAt',s.expires_at,'version',s.approval_version);
end $$;
revoke all on function public.delivery_album_session(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.delivery_album_session(text,uuid,boolean) to service_role;

-- Cookie só reaproveita sessão deste destinatário e da versão aprovada atual.
create or replace function public.delivery_album_token_session(p_token_hash text,p_session_hash text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.delivery_album_tokens t
  join public.delivery_recipients r on r.id=t.recipient_id
  join public.delivery_batches b on b.id=r.batch_id
  join public.delivery_access_sessions s on s.recipient_id=t.recipient_id and s.session_hash=p_session_hash
  where t.token_hash=p_token_hash and t.revoked_at is null
    and s.revoked_at is null and s.expires_at>now() and s.approval_version=b.approved_version);
$$;
revoke all on function public.delivery_album_token_session(text,text) from public,anon,authenticated;
grant execute on function public.delivery_album_token_session(text,text) to service_role;
