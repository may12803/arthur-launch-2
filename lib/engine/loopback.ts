// A request is loopback when it was made on the machine itself (the in-process scheduler, or flyctl ssh) and never passed through
// the Fly proxy. The proxy always sets Fly-Client-IP (a client cannot remove it), and a direct call names 127.0.0.1/localhost as host.
export function isLoopback(headers: { get(name: string): string | null }): boolean {
  if (headers.get("fly-client-ip") || headers.get("fly-forwarded-port") || headers.get("x-forwarded-for")) return false;
  const host = (headers.get("host") || "").toLowerCase().replace(/:\d+$/, "");
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
}
