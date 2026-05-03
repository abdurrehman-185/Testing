import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const hasValidConfig =
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes("your-") &&
  !supabaseAnonKey.includes("your-");

export const supabase = hasValidConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
