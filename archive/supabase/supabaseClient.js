import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const SUPABASE_CDN =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm";

/**
 * True only when config.js has real-looking values. The UI shows a setup
 * screen instead of crashing when the project has not been configured yet.
 */
export const isConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim()) &&
  !/YOUR-/i.test(SUPABASE_ANON_KEY);

export let supabase = null;
export let supabaseLoadError = null;

if (isConfigured) {
  try {
    const { createClient } = await import(SUPABASE_CDN);
    supabase = createClient(SUPABASE_URL.trim().replace(/\/$/, ""), SUPABASE_ANON_KEY.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storageKey: "hmt-auth",
      },
      realtime: {
        params: { eventsPerSecond: 5 },
      },
    });
  } catch (error) {
    console.error("Could not load Supabase client", error);
    supabaseLoadError = error;
  }
}
