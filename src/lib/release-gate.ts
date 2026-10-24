/**
 * Release gate — one aggregated pre-publish verdict over the checks the pipeline already runs
 * separately: script publish-readiness (ad-law words / hook / duration / CTA / early product),
 * composed-video QC (streams / black / silence / loudness) and the asset license manifest
 * (commercial risk / attribution). Callers assemble the three sub-reports; this module only maps
 * them onto a single pass|warn|fail report with strict, scriptable semantics:
 *
 *   - fail  → something is objectively broken or platform-risky; do not publish as-is
 *   - warn  → needs a human decision (license review, attribution, soft risks)
 *   - pass  → nothing blocking found by the automated checks
 *
 * Pure functions; the route/CLI/MCP feed it data. CLI maps fail (and warn under --strict) to
 * exit code 2 so shell scripts and agents can gate on it.
 */
import type { QcReport } from "@/lib/video-composer/qc";
import type { CreditsManifest } from "@/lib/asset-credits";
import type { ReadinessReport } from "@/lib/publish-readiness";
import type { AiCommerceWarning } from "@/lib/ai-commerce-compliance";
import type { RealMixReport } from "@/lib/real-mix";

export type GateStatus = "pass" | "warn" | "fail";
export type GateItemId = "readiness" | "qc" | "quality" | "credits" | "aiPolicy" | "realMix";

export interface GateItem {
  id: GateItemId;
  status: GateStatus;
  /** one-line summary, bilingual — UI/CLI pick by locale */
  message: { en: string };
  /** concrete problems behind a warn/fail, ready to display as sub-lines */
  problems: { en: string }[];
}

export interface GateReport {
  /** worst status across items */
  status: GateStatus;
  items: GateItem[];
  summary: { pass: number; warn: number; fail: number };
  verdict: { en: string };
}

/**
 * Script readiness → gate item.
 */
export function gateItemFromReadiness(report: ReadinessReport | null): GateItem {
  if (!report) {
    return {
      id: "readiness",
      status: "fail",
      message: {
        en: "No script to check — generate and select a script first",
      },
      problems: [],
    };
  }
  const problems = report.items
    .filter((item) => item.status !== "pass")
    .map((item) => ({ en: item.message }));
  if (report.overall === "needsWork") {
    return {
      id: "readiness",
      status: "fail",
      message: {
        en: `Script readiness check failed (${report.fail} to fix, ${report.warn} risky)`,
      },
      problems,
    };
  }
  if (report.overall === "risky") {
    return {
      id: "readiness",
      status: "warn",
      message: {
        en: `Script readiness check has ${report.warn} risk warning(s)`,
      },
      problems,
    };
  }
  return {
    id: "readiness",
    status: "pass",
    message: { en: "Script readiness checks all passed" },
    problems: [],
  };
}

/** Composed-video QC → gate item. `null` means nothing was composed yet — that alone blocks publishing. */
export function gateItemFromQc(qc: QcReport | null): GateItem {
  if (!qc) {
    return {
      id: "qc",
      status: "fail",
      message: { en: "No composed video yet — compose before gating" },
      problems: [],
    };
  }
  const problems = qc.checks.filter((c) => c.level !== "ok").map((c) => c.message);
  if (qc.status === "fail") {
    const n = qc.checks.filter((c) => c.level === "fail").length;
    return {
      id: "qc",
      status: "fail",
      message: { en: `Video QC failed (${n} check(s))` },
      problems,
    };
  }
  if (qc.status === "warn") {
    return {
      id: "qc",
      status: "warn",
      message: {
        en: `Video QC has ${problems.length} warning(s)`,
      },
      problems,
    };
  }
  return {
    id: "qc",
    status: "pass",
    message: { en: "Video QC passed" },
    problems: [],
  };
}

export interface QualityGateRow {
  shotId: number;
  verdict?: "accept" | "review" | "reject" | null;
  humanDecision?: "accepted" | "rejected" | null;
  overall?: number | null;
}

/** Semantic generation quality → gate item. Automated doubt warns; an explicit human rejection fails. */
export function gateItemFromGenerationQuality(rows: QualityGateRow[]): GateItem {
  if (rows.length === 0) {
    return {
      id: "quality",
      status: "pass",
      message: { en: "No AI-generated shots require semantic review" },
      problems: [],
    };
  }
  const rejected = rows.filter((row) => row.humanDecision === "rejected");
  const pending = rows.filter((row) => !row.humanDecision && !row.verdict);
  const flagged = rows.filter((row) => !row.humanDecision && (row.verdict === "review" || row.verdict === "reject"));
  const problems = [
    ...rejected.map((row) => ({ en: `Shot ${row.shotId}: explicitly rejected by the reviewer` })),
    ...pending.map((row) => ({ en: `Shot ${row.shotId}: shot quality has not been evaluated` })),
    ...flagged.map((row) => ({
      en: `Shot ${row.shotId}: automated review${row.overall != null ? ` scored ${Math.round(row.overall)}` : ""}; human confirmation needed`,
    })),
  ];
  if (rejected.length > 0) {
    return {
      id: "quality",
      status: "fail",
      message: { en: `${rejected.length} active shot(s) were explicitly rejected; replace or fix them before release` },
      problems,
    };
  }
  if (pending.length > 0 || flagged.length > 0) {
    return {
      id: "quality",
      status: "warn",
      message: { en: `${pending.length + flagged.length} AI-generated shot(s) still need quality confirmation` },
      problems,
    };
  }
  return {
    id: "quality",
    status: "pass",
    message: { en: "All active AI-generated shots passed automated or human review" },
    problems: [],
  };
}

/**
 * Asset license manifest → gate item. License review is inherently a human decision, so restricted /
 * unknown licenses map to warn (blocking under --strict), never to an automated fail.
 */
export function gateItemFromCredits(m: CreditsManifest | null): GateItem {
  if (!m) {
    return {
      id: "credits",
      status: "warn",
      message: {
        en: "No asset records to verify licensing — confirm manually if external footage was used",
      },
      problems: [],
    };
  }
  const rows = [...m.items, ...(m.bgm ? [m.bgm] : [])];
  const problems = rows
    .filter((i) => i.risk === "review")
    .map((i) => {
      const enWhere = i.shotId >= 0 ? `Shot ${i.shotId + 1}` : "BGM";
      return {
        en: `${enWhere}: ${i.license || "license unknown"} — ${i.note.en}`,
      };
    });
  if (m.summary.needsAttribution > 0) {
    problems.push({
      en: `${m.summary.needsAttribution} attribution line(s) must accompany the post (see the manifest)`,
    });
  }
  if (m.summary.needsReview > 0) {
    return {
      id: "credits",
      status: "warn",
      message: {
        en: `${m.summary.needsReview} asset license(s) need manual review (NC/ND/unknown) — confirm or replace before running ads`,
      },
      problems,
    };
  }
  if (m.summary.needsAttribution > 0) {
    return {
      id: "credits",
      status: "warn",
      message: {
        en: `Assets are commercial-safe, but ${m.summary.needsAttribution} attribution(s) must accompany the post`,
      },
      problems,
    };
  }
  return {
    id: "credits",
    status: "pass",
    message: { en: "Assets are commercial-safe, no attribution required" },
    problems: [],
  };
}

/**
 * AI-commerce policy warnings → gate item. Always warn, never fail: these are platform-policy
 * judgment calls (TikTok's AI-content rules), and per product direction every feature stays
 * available — the user decides after seeing the risk.
 */
export function gateItemFromAiPolicy(warnings: AiCommerceWarning[]): GateItem {
  if (warnings.length === 0) {
    return {
      id: "aiPolicy",
      status: "pass",
      message: {
        en: "AI-commerce platform-policy checks passed (review form / digital-human category / testimony claims)",
      },
      problems: [],
    };
  }
  return {
    id: "aiPolicy",
    status: "warn",
    message: {
      en: `AI-commerce platform policy raised ${warnings.length} risk warning(s) (TikTok 2026-07 rules; nothing is blocked — review before publishing)`,
    },
    problems: warnings.map((w) => w.message),
  };
}

/**
 * Real/AI mix metering → gate item. Purely informative and ALWAYS pass: a labeled pure-AI video
 * is publishable, so the mix ratio must never block a pipeline (or trip CLI --strict). It exists
 * to make the TikTok hybrid-content traffic tilt visible and actionable.
 */
export function gateItemFromRealMix(mix: RealMixReport | null): GateItem {
  if (!mix) {
    return {
      id: "realMix",
      status: "pass",
      message: {
        en: "No script/assets yet — real-footage share not computable",
      },
      problems: [],
    };
  }
  return { id: "realMix", status: "pass", message: mix.message, problems: [] };
}

/** Aggregate gate items into the final report (worst status wins). Pure function. */
export function buildGateReport(items: GateItem[]): GateReport {
  const pass = items.filter((i) => i.status === "pass").length;
  const warn = items.filter((i) => i.status === "warn").length;
  const fail = items.filter((i) => i.status === "fail").length;
  const status: GateStatus = fail > 0 ? "fail" : warn > 0 ? "warn" : "pass";
  const verdict =
    status === "fail"
      ? {
          en: "Release gate failed — fix the blocking issues before publishing or running ads",
        }
      : status === "warn"
        ? {
            en: "Conditionally passed — review the flagged risks before publishing",
          }
        : {
            en: "Release gate passed — no blocking issues found by automated checks",
          };
  return { status, items, summary: { pass, warn, fail }, verdict };
}
