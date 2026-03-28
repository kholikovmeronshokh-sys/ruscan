import { type IpInfoResponse, type ReportResponse, type RiskLevel } from "@/lib/types";

const VPN_KEYWORDS = [
  "vpn",
  "proxy",
  "tunnel",
  "hosting",
  "cloud",
  "digitalocean",
  "m247",
  "ovh",
  "amazon",
  "aws",
  "google",
  "oracle",
  "azure",
  "vultr",
  "colo",
  "server",
  "datacenter",
  "bluevps",
  "linode",
  "hetzner",
  "contabo",
];

export function detectIpVersion(ip?: string): ReportResponse["ipVersion"] {
  if (!ip) return "Не определено";
  if (ip.includes(":")) return "IPv6";
  if (ip.includes(".")) return "IPv4";
  return "Не определено";
}

export function normalizeText(value?: string) {
  return value?.trim() || "Нет данных";
}

export function normalizeNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") {
    return "Нет данных";
  }

  return String(value);
}

export function scoreLatency(latencyMs: number) {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return 5;
  if (latencyMs < 80) return 10;
  if (latencyMs < 130) return 9;
  if (latencyMs < 180) return 8;
  if (latencyMs < 250) return 7;
  if (latencyMs < 350) return 6;
  if (latencyMs < 500) return 5;
  return 4;
}

export function classifyProviderType(input: {
  isp: string;
  org: string;
  asName: string;
  asType: string;
  privacy?: IpInfoResponse["privacy"];
}) {
  const haystack = `${input.isp} ${input.org} ${input.asName} ${input.asType}`.toLowerCase();

  if (input.privacy?.tor) return "Tor";
  if (input.privacy?.proxy) return "Proxy";
  if (input.privacy?.vpn) return "VPN";
  if (input.privacy?.hosting) return "Hosting";
  if (VPN_KEYWORDS.some((item) => haystack.includes(item))) return "Hosting/VPN";
  if (haystack.includes("mobile") || haystack.includes("lte")) return "Мобильная сеть";
  return "Резидентский или обычный провайдер";
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= 9) return "Критический";
  if (score >= 7) return "Высокий";
  if (score >= 4) return "Средний";
  return "Низкий";
}

export function analyzeNetwork(params: {
  ip: string;
  country: string;
  city: string;
  region: string;
  isp: string;
  org: string;
  timezone: string;
  asName: string;
  asType: string;
  ipinfo?: IpInfoResponse | null;
  timezoneMismatch: boolean;
  leakRisk: boolean;
  latencyScore: number;
}) {
  const flags: string[] = [];
  const recommendations: string[] = [];
  let vpnScore = 3;
  let anonymityScore = 7;

  const joinedProvider = `${params.isp} ${params.org} ${params.asName} ${params.asType}`.toLowerCase();
  const privacy = params.ipinfo?.privacy;

  if (VPN_KEYWORDS.some((item) => joinedProvider.includes(item))) {
    vpnScore += 3;
    flags.push("Провайдер похож на дата-центр, hosting или VPN-инфраструктуру.");
  }

  if (privacy?.vpn || privacy?.proxy || privacy?.tor || privacy?.relay) {
    vpnScore += 4;
    anonymityScore += 2;
    flags.push("IPinfo сообщил о VPN, proxy, relay или Tor-признаках.");
  }

  if (privacy?.hosting) {
    vpnScore += 2;
    flags.push("IP отмечен как hosting-инфраструктура.");
  }

  if (params.timezoneMismatch) {
    vpnScore += 2;
    flags.push("Часовой пояс браузера отличается от часового пояса IP.");
  }

  if (params.leakRisk) {
    vpnScore += 1;
    anonymityScore -= 2;
    flags.push("WebRTC может раскрывать дополнительный IP.");
    recommendations.push("Отключите или ограничьте WebRTC в браузере или VPN-клиенте.");
  }

  if (params.latencyScore <= 5) {
    recommendations.push("Сеть отвечает медленно: проверьте сервер VPN или качество канала.");
  }

  if (joinedProvider.includes("mobile") || joinedProvider.includes("lte")) {
    vpnScore = Math.max(0, vpnScore - 1);
  }

  if (
    params.country === "Нет данных" &&
    params.city === "Нет данных" &&
    params.region === "Нет данных"
  ) {
    recommendations.push("Проверьте лимиты API или корректность ключей Geo/IP сервисов.");
  }

  vpnScore = Math.min(10, Math.max(0, vpnScore));
  anonymityScore = Math.min(10, Math.max(1, anonymityScore));

  if (vpnScore < 4 && !flags.length) {
    flags.push("Явных VPN-признаков не обнаружено.");
  }

  if (!recommendations.length) {
    recommendations.push("Серьезных сетевых аномалий не найдено.");
  }

  const status: ReportResponse["status"] =
    vpnScore >= 6 ? "VPN обнаружен" : "VPN не обнаружен";

  return {
    status,
    riskLevel: getRiskLevel(vpnScore),
    vpnScore,
    anonymityScore,
    speedScore: params.latencyScore,
    flags,
    recommendations,
    rawSignals: {
      vpn: Boolean(privacy?.vpn),
      proxy: Boolean(privacy?.proxy),
      tor: Boolean(privacy?.tor),
      relay: Boolean(privacy?.relay),
      hosting: Boolean(privacy?.hosting),
      service: normalizeText(privacy?.service),
    },
  };
}
