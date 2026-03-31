"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type BrowserSupabaseConfig = {
  anonKey: string;
  url: string;
};

let cachedClient: SupabaseClient | null = null;
let cachedKey = "";

export function getBrowserSupabaseClient(config: BrowserSupabaseConfig) {
  const cacheKey = `${config.url}::${config.anonKey}`;

  if (cachedClient && cachedKey === cacheKey) {
    return cachedClient;
  }

  cachedClient = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
  cachedKey = cacheKey;

  return cachedClient;
}
