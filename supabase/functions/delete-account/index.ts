import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createDeleteAccountHandler } from "./handler.mjs";

Deno.serve(createDeleteAccountHandler({
  createClient,
  getEnv: (name: string) => Deno.env.get(name),
}));
