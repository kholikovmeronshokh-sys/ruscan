export type GeoIpifyResponse = {
  ip?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    lat?: number;
    lng?: number;
    timezone?: string;
    postalCode?: string;
  };
  isp?: string;
  as?: {
    asn?: number;
    name?: string;
    route?: string;
    domain?: string;
    type?: string;
  };
};

export type IpInfoResponse = {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  postal?: string;
  timezone?: string;
  hostname?: string;
  anycast?: boolean;
  privacy?: {
    vpn?: boolean;
    proxy?: boolean;
    tor?: boolean;
    relay?: boolean;
    hosting?: boolean;
    service?: string;
  };
};

export type RiskLevel = "Низкий" | "Средний" | "Высокий" | "Критический";

export type ReportResponse = {
  ip: string;
  ipVersion: "IPv4" | "IPv6" | "Не определено";
  country: string;
  city: string;
  region: string;
  timezone: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  isp: string;
  org: string;
  hostname: string;
  anycast: string;
  asn: string;
  asName: string;
  asDomain: string;
  asRoute: string;
  asType: string;
  providerType: string;
  status: "VPN обнаружен" | "VPN не обнаружен" | "Проверка ограничена";
  riskLevel: RiskLevel;
  vpnScore: number;
  anonymityScore: number;
  speedScore: number;
  timezoneMismatch: boolean;
  rawSignals: {
    vpn: boolean;
    proxy: boolean;
    tor: boolean;
    relay: boolean;
    hosting: boolean;
    service: string;
  };
  flags: string[];
  recommendations: string[];
  sourceHealth: {
    ipify: boolean;
    ipinfo: boolean;
  };
};
