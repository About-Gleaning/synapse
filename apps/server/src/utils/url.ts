import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import net from "node:net";

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [ipToInt("10.0.0.0"), ipToInt("10.255.255.255")],
  [ipToInt("127.0.0.0"), ipToInt("127.255.255.255")],
  [ipToInt("169.254.0.0"), ipToInt("169.254.255.255")],
  [ipToInt("172.16.0.0"), ipToInt("172.31.255.255")],
  [ipToInt("192.168.0.0"), ipToInt("192.168.255.255")],
];

export async function validatePublicUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("INVALID_URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("INVALID_URL");
  }

  if (parsed.hostname === "localhost") {
    throw new Error("URL_BLOCKED");
  }

  let addresses: LookupAddress[];
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true });
  } catch {
    throw new Error("INVALID_URL");
  }
  for (const item of addresses) {
    if (isPrivateIp(item.address)) {
      throw new Error("URL_BLOCKED");
    }
  }

  return parsed;
}

export function toCanonicalUrl(u: URL): string {
  const clean = new URL(u.toString());
  const removeKeys: string[] = [];
  clean.searchParams.forEach((_v, k) => {
    if (k.startsWith("utm_") || k === "spm" || k === "from") {
      removeKeys.push(k);
    }
  });
  removeKeys.forEach((k) => clean.searchParams.delete(k));
  clean.hash = "";
  return clean.toString();
}

function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const value = ipToInt(ip);
    return PRIVATE_IPV4_RANGES.some(([start, end]) => value >= start && value <= end);
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    );
  }
  return true;
}

function ipToInt(ip: string): number {
  return ip
    .split(".")
    .map((x) => Number(x))
    .reduce((sum, part) => (sum << 8) + part, 0) >>> 0;
}
