import { NextResponse } from "next/server";
import { isRevisionConflictError } from "@/lib/server/project-store";

export function mutationErrorResponse(error: unknown, fallbackMessage: string) {
  if (isRevisionConflictError(error)) {
    return NextResponse.json(
      {
        currentRevision: error.currentRevision,
        expectedRevision: error.expectedRevision,
        message: error.message,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      message: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 },
  );
}
