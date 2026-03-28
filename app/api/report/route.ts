import { NextRequest, NextResponse } from "next/server";
import {
  analyzeNetwork,
  classifyProviderType,
  detectIpVersion,
  normalizeNumber,
  normalizeText,
} from "@/lib/utils";
import { type GeoIpifyResponse, type IpInfoResponse, type ReportResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

function getForwardedIp(request: NextRequest) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "";

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "";
}

function isLocalIp(ip?: string) {
  if (!ip) return true;
  const normalized = ip.trim().toLowerCase();

  return (
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("172.16.") ||
    normalized.startsWith("172.17.") ||
    normalized.startsWith("172.18.") ||
    normalized.startsWith("172.19.") ||
    normalized.startsWith("172.2") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

async function fetchGeoIpify(apiKey: string, ip?: string) {
  const url = new URL("https://geo.ipify.org/api/v2/country,city");
  url.searchParams.set("apiKey", apiKey);
  if (ip) {
    url.searchParams.set("ipAddress", ip);
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Geo IPify error: ${response.status}`);
  }

  return (await response.json()) as GeoIpifyResponse;
}

async function fetchIpInfo(token: string, ip?: string) {
  const base = ip ? `https://ipinfo.io/${ip}` : "https://ipinfo.io";
  const url = new URL(`${base}/json`);
  url.searchParams.set("token", token);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`IPinfo error: ${response.status}`);
  }

  return (await response.json()) as IpInfoResponse;
}

export async function GET(request: NextRequest) {
  const ipifyKey = process.env.IPIFY_API_KEY;
  const ipinfoToken = process.env.IPINFO_TOKEN;
  const searchParams = request.nextUrl.searchParams;
  const clientIp = searchParams.get("ip")?.trim() || "";
  const timezone = searchParams.get("tz")?.trim() || "";
  const leakRisk = searchParams.get("leakRisk") === "1";
  const latencyScore = Number(searchParams.get("latencyScore") || "5");

  if (!ipifyKey || !ipinfoToken) {
    return NextResponse.json(
      {
        error: "Отсутствуют IPIFY_API_KEY или IPINFO_TOKEN в переменных окружения.",
      },
      { status: 500 },
    );
  }

  const requestIp = getForwardedIp(request);
  const candidateIp = isLocalIp(clientIp) ? requestIp : clientIp;
  const lookupIp = isLocalIp(candidateIp) ? "" : candidateIp;

  let geoIpify: GeoIpifyResponse | null = null;
  let ipinfo: IpInfoResponse | null = null;

  try {
    geoIpify = await fetchGeoIpify(ipifyKey, lookupIp);
  } catch {
    geoIpify = null;
  }

  const resolvedIp = geoIpify?.ip || lookupIp || requestIp;

  try {
    ipinfo = await fetchIpInfo(ipinfoToken, resolvedIp);
  } catch {
    ipinfo = null;
  }

  const ip = resolvedIp || ipinfo?.ip || "Не удалось определить";
  const country = normalizeText(geoIpify?.location?.country || ipinfo?.country);
  const city = normalizeText(geoIpify?.location?.city || ipinfo?.city);
  const region = normalizeText(geoIpify?.location?.region || ipinfo?.region);
  const isp = normalizeText(geoIpify?.isp);
  const org = normalizeText(ipinfo?.org || geoIpify?.as?.name);
  const hostname = normalizeText(ipinfo?.hostname);
  const anycast = ipinfo?.anycast ? "Да" : "Нет";
  const postalCode = normalizeText(geoIpify?.location?.postalCode || ipinfo?.postal);
  const latitude = normalizeNumber(geoIpify?.location?.lat);
  const longitude = normalizeNumber(geoIpify?.location?.lng);
  const asn = normalizeNumber(geoIpify?.as?.asn);
  const asName = normalizeText(geoIpify?.as?.name);
  const asDomain = normalizeText(geoIpify?.as?.domain);
  const asRoute = normalizeText(geoIpify?.as?.route);
  const asType = normalizeText(geoIpify?.as?.type);
  const networkTimezone = normalizeText(geoIpify?.location?.timezone || ipinfo?.timezone);
  const timezoneMismatch =
    Boolean(timezone) &&
    networkTimezone !== "Нет данных" &&
    networkTimezone !== timezone.replace("UTC", "");

  const analysis = analyzeNetwork({
    ip,
    country,
    city,
    region,
    isp,
    org,
    timezone: networkTimezone,
    asName,
    asType,
    ipinfo,
    timezoneMismatch,
    leakRisk,
    latencyScore,
  });

  const providerType = classifyProviderType({
    isp,
    org,
    asName,
    asType,
    privacy: ipinfo?.privacy,
  });

  const payload: ReportResponse = {
    ip,
    ipVersion: detectIpVersion(ip),
    country,
    city,
    region,
    timezone: networkTimezone,
    postalCode,
    latitude,
    longitude,
    isp,
    org,
    hostname,
    anycast,
    asn,
    asName,
    asDomain,
    asRoute,
    asType,
    providerType,
    status: analysis.status,
    riskLevel: analysis.riskLevel,
    vpnScore: analysis.vpnScore,
    anonymityScore: analysis.anonymityScore,
    speedScore: analysis.speedScore,
    timezoneMismatch,
    rawSignals: analysis.rawSignals,
    flags: analysis.flags,
    recommendations: analysis.recommendations,
    sourceHealth: {
      ipify: Boolean(geoIpify),
      ipinfo: Boolean(ipinfo),
    },
  };

  return NextResponse.json(payload);
}
