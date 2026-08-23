import { config } from '../config.js';

export interface GeoInfo {
  country: string | null;
  city: string | null;
  region: string | null;
}

const EMPTY: GeoInfo = { country: null, city: null, region: null };
const cache = new Map<string, { value: GeoInfo; expires: number }>();
const TTL_MS = 6 * 60 * 60 * 1000;

function isPrivateIp(ip: string): boolean {
  return (
    ip === 'unknown' ||
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fc') ||
    ip.startsWith('fe80')
  );
}

/** Best-effort IP geolocation using ip-api.com (free tier, HTTP only). */
export async function lookupGeo(ip: string): Promise<GeoInfo> {
  if (!config.geoLookup || isPrivateIp(ip)) return EMPTY;

  const cached = cache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city,regionName`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as { status?: string; country?: string; city?: string; regionName?: string };
    if (data.status !== 'success') return EMPTY;
    const value: GeoInfo = {
      country: data.country || null,
      city: data.city || null,
      region: data.regionName || null,
    };
    cache.set(ip, { value, expires: Date.now() + TTL_MS });
    return value;
  } catch {
    return EMPTY;
  }
}
