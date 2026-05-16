import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://xkgiovddglqxcruwabtm.supabase.co";
const supabaseAnonKey = "sb_publishable_8m9MPHxpmoLSU1CEfJr__w_8xNH8V-5";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 10 } }
});