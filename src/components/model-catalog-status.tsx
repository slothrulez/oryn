"use client";
import { Button } from "@/components/ui/button";
import type { ModelCatalogStatus as Status } from "@/lib/model-catalog";
export function ModelCatalogStatus({ statuses, pending, onRetry }: { statuses: Status[]; pending: string[]; onRetry: (provider?: string) => void }) {
  if (!statuses.length && !pending.length) return null;
  const names = [...new Set([...statuses.map((status) => status.provider), ...pending])].sort();
  const failures = statuses.filter((status) => status.status === "error" || status.status === "fallback").length;
  return <details className="my-3 rounded-xl border border-border/60 bg-muted/20 p-3" open={failures > 0 || undefined}>
    <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">{pending.length ? ("Loading model catalogs…") : failures ? (`${failures} catalogs need attention`) : ("Model catalogs loaded")}</summary>
    <p className="mb-2 text-xs leading-5 text-muted-foreground">{"Catalog status does not verify credentials, balance or generation availability. Refreshing does not generate content."}</p>
    {names.map((name) => <div key={name} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 py-2">
      <div className="min-w-0 text-xs"><p className="font-medium">{name}</p>{statuses.filter((status) => status.provider === name).map((status) => <p key={status.mediaType} className={`mt-1 ${status.status === "error" || status.status === "fallback" ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground"}`}>
        {status.mediaType === "image" ? ("Image") : ("Video")} · {status.status === "error" ? ("Catalog unavailable") : status.status === "fallback" ? (`Refresh failed; ${status.count} fallback models`) : status.status === "empty" ? ("No models") : `${status.count} ${"models"}`} · {new Date(status.checkedAt).toLocaleTimeString("en-US")}
        {status.catalogUpdatedAt && <span> · {"Data as of "}{new Date(status.catalogUpdatedAt).toLocaleString("en-US")}</span>}
      </p>)}</div><Button variant="outline" className="min-h-11" disabled={pending.length > 0} onClick={() => onRetry(name)}>{pending.includes(name) ? ("Loading") : ("Refresh")}</Button>
    </div>)}
  </details>;
}
