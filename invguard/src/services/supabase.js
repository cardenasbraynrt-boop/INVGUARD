import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://mvbxunvfxnzkypvyadwd.supabase.co";

const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Ynh1bnZmeG56a3lwdnlhZHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA5MTMsImV4cCI6MjA5NTk4NjkxM30.ymDlRKDE6UH48yPAdkzkYfbER9YRagzDMaA1MZCPhi0";

export const supabase = createClient(supabaseUrl, supabaseKey);
