import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export const createClient = () => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  return createBrowserClient(supabaseUrl, supabaseKey);
};