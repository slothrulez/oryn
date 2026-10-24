"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LuChartNoAxesColumn, LuCheck } from "react-icons/lu";
import type { StyleInsight, HookInsight } from "@/lib/performance-insights";

// style key → display name (aggregation returns the styleType key)
const STYLE_LABEL: Record<string, { en: string }> = {
  pain_point: { en: "Pain-point" },
  scene: { en: "Scene" },
  comparison: { en: "Comparison" },
  story: { en: "Story" },
  custom: { en: "Custom" },
};

// hook mechanism id → display name (corresponds to HOOK_PATTERNS in hook-patterns)
const HOOK_LABEL: Record<string, { en: string }> = {
  visual_shock: { en: "Visual shock" },
  suspense_question: { en: "Suspense" },
  contrast: { en: "Contrast" },
  pain_strike: { en: "Pain-point" },
  before_after: { en: "Before-after" },
  sound_hook: { en: "Sound hook" },
  challenge_doubt: { en: "Challenge" },
  identity: { en: "Identity" },
  number_benefit: { en: "Number" },
  unexpected: { en: "Unexpected" },
};

const NUM_FIELDS = [
  { key: "views", en: "Views" },
  { key: "likes", en: "Likes" },
  { key: "comments", en: "Comments" },
  { key: "shares", en: "Shares" },
  { key: "orders", en: "Orders" },
] as const;

type FormState = { platform: string; hookId: string; views: string; likes: string; comments: string; shares: string; orders: string; note: string };
const EMPTY: FormState = { platform: "tiktok", hookId: "", views: "", likes: "", comments: "", shares: "", orders: "", note: "" };

export function PerformanceFeedback({ projectId }: { projectId: string }) {
  const locale = useLocale();
  const en = locale === "en";
  const [form, setForm] = useState<FormState>(EMPTY);
  const [insights, setInsights] = useState<StyleInsight[]>([]);
  const [hookInsights, setHookInsights] = useState<HookInsight[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadInsights = useCallback(async () => {
    try {
      const r = await fetch("/api/insights/styles");
      const j = await r.json();
      setInsights(Array.isArray(j.insights) ? j.insights : []);
      setHookInsights(Array.isArray(j.hookInsights) ? j.hookInsights : []);
    } catch {
      /* silent: an empty insights section is acceptable */
    }
  }, []);
  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/project/${projectId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSaved(true);
      setForm({ ...EMPTY, platform: form.platform });
      loadInsights();
    } finally {
      setSaving(false);
    }
  };

  const fmtPct = (x: number) => (x * 100).toFixed(2) + "%";
  const styleName = (s: string) => STYLE_LABEL[s]?.["en"] ?? s;
  const hookName = (h: string) => HOOK_LABEL[h]?.["en"] ?? h;
  const canSave = Number(form.views) > 0;

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <LuChartNoAxesColumn className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">{"Performance feedback"}</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {"After publishing, log this video's numbers → learn which script style actually sells, and let it feed back into future scripts."}
        </p>

        {/* data entry form */}
        <div className="flex flex-wrap items-end gap-2 mb-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{"Platform"}</span>
            <select
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="tiktok">TikTok</option>
              <option value="reels">Instagram Reels</option>
              <option value="shorts">YouTube Shorts</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{"Hook"}</span>
            <select
              value={form.hookId}
              onChange={(e) => setForm({ ...form, hookId: e.target.value })}
              title={"Which hook mechanism this video used (for hook A/B)"}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{"— hook —"}</option>
              {Object.entries(HOOK_LABEL).map(([id, l]) => (
                <option key={id} value={id}>
                  {en ? l.en : l.en}
                </option>
              ))}
            </select>
          </label>
          {NUM_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{en ? f.en : f.en}</span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="h-9 w-20"
                placeholder="0"
              />
            </label>
          ))}
          <Button onClick={submit} disabled={!canSave || saving} size="sm" className="brand-gradient text-white h-9">
            {saved ? <LuCheck className="w-4 h-4 mr-1" /> : null}
            {saving ? ("Saving…") : saved ? ("Saved") : "Save"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mb-4">
          {"Tip: views is required; the script style is captured automatically."}
        </p>

        {/* aggregated insight: which style sells best */}
        {insights.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <p className="text-xs font-medium mb-2">
              {"Which style sells best (all projects)"}
            </p>
            <div className="space-y-1.5">
              {insights.map((it, i) => (
                <div key={it.style} className="flex items-center gap-3 text-xs">
                  <span className={`w-16 shrink-0 ${i === 0 ? "text-emerald-500 font-medium" : ""}`}>
                                        {styleName(it.style)}
                  </span>
                  <span className="text-muted-foreground">
                    {"conv."} <b className={i === 0 ? "text-emerald-500" : ""}>{fmtPct(it.conversionRate)}</b>
                  </span>
                  <span className="text-muted-foreground">
                    {"eng."} {fmtPct(it.engagementRate)}
                  </span>
                  <span className="text-muted-foreground/70">
                    {`${it.samples} sample(s)`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* aggregated insight: which hook mechanism sells best */}
        {hookInsights.length > 0 && (
          <div className="border-t border-border/50 pt-3 mt-3">
            <p className="text-xs font-medium mb-2">
              {"Which hook sells best (all projects)"}
            </p>
            <div className="space-y-1.5">
              {hookInsights.map((it, i) => (
                <div key={it.hookId} className="flex items-center gap-3 text-xs">
                  <span className={`w-16 shrink-0 ${i === 0 ? "text-emerald-500 font-medium" : ""}`}>
                                        {hookName(it.hookId)}
                  </span>
                  <span className="text-muted-foreground">
                    {"conv."} <b className={i === 0 ? "text-emerald-500" : ""}>{fmtPct(it.conversionRate)}</b>
                  </span>
                  <span className="text-muted-foreground">
                    {"eng."} {fmtPct(it.engagementRate)}
                  </span>
                  <span className="text-muted-foreground/70">
                    {`${it.samples} sample(s)`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
