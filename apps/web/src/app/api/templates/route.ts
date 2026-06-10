import { listTemplateCatalog } from "@photo-book-maker/core";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    catalog: listTemplateCatalog(),
  });
}
