export function getPublicSupabaseAuthConfig() {
  return {
    supabaseUrl:
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      process.env.SUPABASE_URL ??
      "",
    supabaseAnonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      "",
  };
}
