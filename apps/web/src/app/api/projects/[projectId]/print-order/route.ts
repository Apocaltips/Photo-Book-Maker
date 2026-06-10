import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "manage");
  if ("response" in auth) {
    return auth.response;
  }

  return NextResponse.json({
    candidates: [
      { role: "primary", vendor: "Peecho" },
      { role: "backup", vendor: "Prodigi" },
      { role: "redundancy", vendor: "Cloudprinter" },
      { role: "reserve", vendor: "RPI/Blurb, Lulu, Gelato" },
    ],
    message:
      "Direct print ordering is not configured in this build. Phase 1 uses proof PDF export. Phase 2 starts with a print-vendor bake-off before enabling checkout.",
    nextStep:
      "Export the proof PDF, order samples manually, then enable a vendor adapter after SKU, bleed, shipping, tax, and reprint workflows pass testing.",
  }, { status: 501 });
}
