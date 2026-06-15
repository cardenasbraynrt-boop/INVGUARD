import { createClient } from "@supabase/supabase-js";

const devFallbackUrl = import.meta.env.DEV
  ? "https://mvbxunvfxnzkypvyadwd.supabase.co"
  : "";

const devFallbackKey = import.meta.env.DEV
  ? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Ynh1bnZmeG56a3lwdnlhZHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA5MTMsImV4cCI6MjA5NTk4NjkxM30.ymDlRKDE6UH48yPAdkzkYfbER9YRagzDMaA1MZCPhi0"
  : "";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  devFallbackUrl;

const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  devFallbackKey;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Configuralas en Vercel o .env.local."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
