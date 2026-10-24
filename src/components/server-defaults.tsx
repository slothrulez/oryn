"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { SERVER_MANAGED_KEY, type ServerAiDefaults } from "@/lib/server-keys";

/**
 * Adopts the server-managed AI key once the persisted settings have loaded, so a merchant with an
 * empty Settings page can upload a photo and generate straight away. Keys the user typed in win.
 */
export function ServerDefaults() {
  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      const s = useSettingsStore.getState();
      if (s.llm.apiKey && s.llm.apiKey !== SERVER_MANAGED_KEY) return;
      try {
        const res = await fetch("/api/server-config", { cache: "no-store" });
        const data = (await res.json()) as ({ managed: true } & ServerAiDefaults) | { managed: false };
        if (cancelled || !data.managed) return;
        const cur = useSettingsStore.getState();
        if (!cur.llm.apiKey) cur.setLLM({ ...cur.llm, ...data.llm, apiKey: SERVER_MANAGED_KEY });
        const openai = cur.providers.openai;
        if (!openai?.apiKey) cur.setProvider("openai", { ...(openai ?? {}), enabled: true, apiKey: SERVER_MANAGED_KEY });
        // adopt the server image model when none is chosen, or when the only choice came from a stale server default
        if (!cur.defaultImageModel || (openai?.apiKey === SERVER_MANAGED_KEY && cur.defaultImageModel === "openai/gpt-image-2")) {
          cur.setDefaultImageModel(data.imageModel);
        }
      } catch {
        /* offline or no server defaults: the normal setup prompts take over */
      }
    };
    const persist = useSettingsStore.persist;
    if (persist.hasHydrated()) void apply();
    const unsub = persist.onFinishHydration(() => void apply());
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  return null;
}
