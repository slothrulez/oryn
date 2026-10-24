import { NextResponse } from "next/server";
import { serverAiDefaults } from "@/lib/server-keys";

export const dynamic = "force-dynamic";

/** Tells the browser whether this deployment carries its own AI key (never the key itself). */
export async function GET() {
  const defaults = serverAiDefaults();
  return NextResponse.json(defaults ? { managed: true, ...defaults } : { managed: false });
}
