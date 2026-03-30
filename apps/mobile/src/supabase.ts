import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { createClient, type Session, type User } from "@supabase/supabase-js";

export type AuthIdentity = {
  email: string;
  id: string;
  name: string;
};

function normalizeConfigValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.trim() || null;
}

const supabaseUrl = normalizeConfigValue(
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
    (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ??
    null,
);
const supabaseAnonKey = normalizeConfigValue(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ??
    null,
);

export const isSupabaseAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const authClient = isSupabaseAuthConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: AsyncStorage,
      },
    })
  : null;

function getDisplayName(user: User) {
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name.trim()
        : "";

  if (fullName) {
    return fullName;
  }

  return user.email?.split("@")[0] ?? "Photo Book Maker user";
}

export function getAuthIdentityFromUser(user: User): AuthIdentity {
  return {
    id: user.id,
    email: user.email ?? "",
    name: getDisplayName(user),
  };
}

export async function getCurrentAuthSession(): Promise<Session | null> {
  if (!authClient) {
    return null;
  }

  const { data } = await authClient.auth.getSession();
  return data.session ?? null;
}

export async function getCurrentAuthIdentity() {
  const session = await getCurrentAuthSession();
  return session?.user ? getAuthIdentityFromUser(session.user) : null;
}

export async function getAccessToken() {
  const session = await getCurrentAuthSession();
  return session?.access_token ?? null;
}
