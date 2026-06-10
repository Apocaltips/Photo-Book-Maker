import { getFirstEnvValue } from "@/lib/server/env";

export function getPublicSupabaseAuthConfig() {
  return {
    supabaseUrl: getFirstEnvValue([
      "NEXT_PUBLIC_SUPABASE_URL",
      "EXPO_PUBLIC_SUPABASE_URL",
      "SUPABASE_URL",
    ]),
    supabaseAnonKey: getFirstEnvValue([
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "EXPO_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ]),
  };
}
