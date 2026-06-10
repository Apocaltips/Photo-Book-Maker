export function getRequestOrigin(request: Request) {
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.trim() ||
    request.headers.get("host")?.trim();
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(request.url).protocol.replace(/:$/, "") ||
    "http";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}
