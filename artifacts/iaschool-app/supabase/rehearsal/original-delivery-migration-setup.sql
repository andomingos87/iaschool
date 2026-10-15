-- Fixture local: um rascunho antigo e a cópia do snapshot aprovado anterior.
do $$ begin if current_setting('port')<>'55441' or inet_server_addr() is not null then raise exception 'local fixture required';end if;end$$;
create table public._fixture_original_delivery_migration(batch_id uuid,approved_items jsonb);
do $$
declare b public.delivery_batches%rowtype; r public.delivery_recipients%rowtype; pending uuid;
begin
 select * into b from public.delivery_batches limit 1;
 select * into r from public.delivery_recipients where batch_id=b.id limit 1;
 perform set_config('request.jwt.claim.sub',b.created_by::text,true);
 pending:=public.create_delivery_batch(b.event_id,array[r.guardian_id],b.terms_version);
 insert into public._fixture_original_delivery_migration
 select pending,jsonb_agg(to_jsonb(a) order by recipient_id,version) from public.delivery_approvals a;
end $$;
