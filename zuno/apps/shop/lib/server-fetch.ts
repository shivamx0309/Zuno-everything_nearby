import dns from "dns";

// Prefer IPv4 DNS results on networks with unreachable NAT64/IPv6 routes (e.g. 64:ff9b::).
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

/**
 * Server-side fetch wrapper that retries once on transient transport/DNS failures
 * (before an HTTP response is received) to mitigate hotspot/NAT64 connection flakiness.
 */
export async function resilientServerFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    await new Promise((r) => setTimeout(r, 250));
    return fetch(input, init);
  }
}

