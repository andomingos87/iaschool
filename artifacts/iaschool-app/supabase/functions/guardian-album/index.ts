// verify_jwt=false: visitante não tem conta. RPCs só service_role; cookie no proxy same-origin.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { makeAlbumHandler } from "../_shared/delivery/album.ts";
Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const handler = makeAlbumHandler({
    rpc: async (name, args) => await admin.rpc(name, args),
    sign: async (path, ttl, download) => {
      const { data, error } = await admin.storage.from("delivery-assets").createSignedUrl(path, ttl, download ? { download } : undefined);
      return error ? null : data?.signedUrl ?? null;
    },
  });
  try { return await handler(req); } catch {
    return new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
  }
});
