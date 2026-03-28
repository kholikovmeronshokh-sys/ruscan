"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { InstallAppButton } from "@/components/install-app-button";
import type { ReportResponse } from "@/lib/types";
import styles from "./dashboard.module.css";

type ClientMetrics = {
  leakRisk: boolean;
  publicCandidates: string[];
  localCandidates: string[];
  latencyMs: number;
  latencyScore: number;
  browserTimezone: string;
  downlink: number | null;
  publicIp: string;
};

type NetworkInformationWithDownlink = {
  downlink?: number;
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

type LeakScanState = "idle" | "running" | "done";

const AUTO_REFRESH_MS = 5000;

function getTimezoneOffsetLabel() {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const mins = String(abs % 60).padStart(2, "0");
  return `${sign}${hours}:${mins}`;
}

async function runPingTest() {
  const startedAt = performance.now();
  await fetch("/api/ping", { cache: "no-store" });
  return Math.round(performance.now() - startedAt);
}

async function getPublicIp() {
  const response = await fetch("https://api64.ipify.org?format=json", {
    cache: "no-store",
  });
  const payload = (await response.json()) as { ip?: string };
  return payload.ip || "";
}

async function fetchReport(params: {
  ip: string;
  timezone: string;
  leakRisk: boolean;
  latencyScore: number;
}) {
  const response = await fetch(
    `/api/report?ip=${encodeURIComponent(params.ip)}&tz=${encodeURIComponent(
      params.timezone,
    )}&leakRisk=${params.leakRisk ? "1" : "0"}&latencyScore=${params.latencyScore}`,
    { cache: "no-store" },
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Не удалось получить данные проверки.");
  }

  return payload as ReportResponse;
}

function scoreLatency(latencyMs: number) {
  if (latencyMs < 80) return 10;
  if (latencyMs < 130) return 9;
  if (latencyMs < 180) return 8;
  if (latencyMs < 250) return 7;
  if (latencyMs < 350) return 6;
  if (latencyMs < 500) return 5;
  return 4;
}

function isIgnoredCandidate(ip: string, publicIp: string) {
  const normalized = ip.trim().toLowerCase();
  const publicNormalized = publicIp.trim().toLowerCase();

  return (
    !normalized ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === publicNormalized
  );
}

async function runWebRtcScan(publicIp: string) {
  if (typeof window === "undefined" || !("RTCPeerConnection" in window)) {
    return {
      leakRisk: false,
      localCandidates: [] as string[],
      publicCandidates: [] as string[],
    };
  }

  return new Promise<{
    leakRisk: boolean;
    localCandidates: string[];
    publicCandidates: string[];
  }>((resolve) => {
    const publicCandidates = new Set<string>();
    const localCandidates = new Set<string>();
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      peer.close();
      resolve({
        leakRisk: publicCandidates.size > 0 || localCandidates.size > 0,
        localCandidates: [...localCandidates],
        publicCandidates: [...publicCandidates],
      });
    };

    peer.createDataChannel("scan");
    peer.onicecandidate = (event) => {
      const candidate = event.candidate?.candidate || "";
      const ipv4Matches = candidate.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
      const ipv6Matches =
        candidate.match(/\b(?:(?:[a-fA-F0-9]{1,4}:){2,7}[a-fA-F0-9]{1,4}|::1)\b/g) || [];

      for (const ip of [...ipv4Matches, ...ipv6Matches]) {
        const normalized = ip.trim().toLowerCase();
        if (isIgnoredCandidate(normalized, publicIp)) {
          continue;
        }

        const isLocal =
          normalized === "::1" ||
          normalized === "127.0.0.1" ||
          normalized.startsWith("10.") ||
          normalized.startsWith("192.168.") ||
          normalized.startsWith("172.16.") ||
          normalized.startsWith("172.17.") ||
          normalized.startsWith("172.18.") ||
          normalized.startsWith("172.19.") ||
          normalized.startsWith("172.2") ||
          normalized.startsWith("fd") ||
          normalized.startsWith("fe80:");

        if (isLocal) {
          localCandidates.add(ip);
        } else {
          publicCandidates.add(ip);
        }
      }

      if (!event.candidate) {
        finish();
      }
    };

    peer
      .createOffer()
      .then((offer) => peer.setLocalDescription(offer))
      .catch(() => {
        finish();
      });

    window.setTimeout(() => {
      finish();
    }, 900);
  });
}

export function Dashboard() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [clientMetrics, setClientMetrics] = useState<ClientMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leakScanState, setLeakScanState] = useState<LeakScanState>("idle");
  const [liveStatus, setLiveStatus] = useState("Мониторинг отключен");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const didLoadRef = useRef(false);
  const inFlightRef = useRef(false);
  const latestIpRef = useRef<string>("");
  const telegramUrl =
    process.env.NEXT_PUBLIC_TELEGRAM_URL || "https://t.me/your_username";

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }

    didLoadRef.current = true;
    let isMounted = true;

    async function runFullScan(reason: string) {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        if (isMounted && !report) {
          setLoading(true);
        }

        setError(null);
        setLiveStatus(`Обновление: ${reason}`);

        const [latencyMs, publicIp] = await Promise.all([runPingTest(), getPublicIp()]);

        const connection =
          typeof navigator !== "undefined" && "connection" in navigator
            ? (navigator.connection as NetworkInformationWithDownlink)
            : undefined;

        const baseMetrics: ClientMetrics = {
          leakRisk: false,
          publicCandidates: [],
          localCandidates: [],
          latencyMs,
          latencyScore: scoreLatency(latencyMs),
          browserTimezone: getTimezoneOffsetLabel(),
          downlink: typeof connection?.downlink === "number" ? connection.downlink : null,
          publicIp,
        };

        const baseReport = await fetchReport({
          ip: baseMetrics.publicIp,
          timezone: baseMetrics.browserTimezone,
          leakRisk: false,
          latencyScore: baseMetrics.latencyScore,
        });

        if (!isMounted) return;

        const ipChanged = latestIpRef.current && latestIpRef.current !== publicIp;
        latestIpRef.current = publicIp;

        setClientMetrics(baseMetrics);
        setReport(baseReport);
        setLoading(false);
        setLeakScanState("running");
        setLastUpdated(new Date().toLocaleTimeString("ru-RU"));
        setLiveStatus(
          ipChanged
            ? "IP изменился. Выполняю быстрый повторный анализ."
            : "Живой мониторинг активен"
        );

        const leakData = await runWebRtcScan(publicIp);

        if (!isMounted) return;

        const fullMetrics: ClientMetrics = {
          ...baseMetrics,
          leakRisk: leakData.leakRisk,
          publicCandidates: leakData.publicCandidates,
          localCandidates: leakData.localCandidates,
        };

        setClientMetrics(fullMetrics);
        setLeakScanState("done");

        if (leakData.leakRisk) {
          const refreshedReport = await fetchReport({
            ip: fullMetrics.publicIp,
            timezone: fullMetrics.browserTimezone,
            leakRisk: true,
            latencyScore: fullMetrics.latencyScore,
          });

          if (isMounted) {
            setReport(refreshedReport);
            setLastUpdated(new Date().toLocaleTimeString("ru-RU"));
          }
        }

        if (isMounted) {
          setLiveStatus("Живой мониторинг активен");
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Произошла ошибка во время проверки.",
          );
          setLoading(false);
          setLeakScanState("done");
          setLiveStatus("Не удалось обновить данные");
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    void runFullScan("первичная загрузка");

    const intervalId = window.setInterval(() => {
      void runFullScan("автообновление");
    }, AUTO_REFRESH_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void runFullScan("возврат во вкладку");
      }
    };

    const onOnline = () => {
      void runFullScan("интернет снова доступен");
    };

    const onFocus = () => {
      void runFullScan("возврат в приложение");
    };

    const connection =
      typeof navigator !== "undefined" && "connection" in navigator
        ? (navigator.connection as NetworkInformationWithDownlink)
        : undefined;

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    connection?.addEventListener?.("change", onFocus);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      connection?.removeEventListener?.("change", onFocus);
    };
  }, []);

  const statusTone = useMemo(() => {
    if (!report) return styles.neutral;
    return report.status === "VPN обнаружен" ? styles.danger : styles.success;
  }, [report]);

  const riskTone = useMemo(() => {
    if (!report) return styles.neutral;
    if (report.riskLevel === "Критический" || report.riskLevel === "Высокий") {
      return styles.danger;
    }
    if (report.riskLevel === "Средний") {
      return styles.neutral;
    }
    return styles.success;
  }, [report]);

  return (
    <main className={styles.page}>
      <div className={styles.heroGlow} />
      <section className={styles.hero}>
        <div className={styles.badge}>Русский VPN / IP Analyzer</div>
        <h1>РусСкан VPN</h1>
        <p className={styles.subtitle}>
          Глубокая проверка IP, ASN, провайдера, hosting-признаков, утечек WebRTC,
          таймзоны и сетевой стабильности в реальном времени.
        </p>
        <div className={styles.actions}>
          <a className={styles.primaryBtn} href="#report">
            Открыть анализ
          </a>
          <a className={styles.secondaryBtn} href={telegramUrl} target="_blank" rel="noreferrer">
            Написать админу в Telegram
          </a>
          <Link className={styles.secondaryBtn} href="/documentation">
            Документация
          </Link>
          <Link className={styles.secondaryBtn} href="/ai">
            AI Помощник
          </Link>
          <InstallAppButton />
        </div>
      </section>

      <section className={styles.grid} id="report">
        <article className={`${styles.card} ${styles.highlight}`}>
          <div className={styles.cardHeader}>
            <span>Статус сети</span>
            <span className={`${styles.status} ${statusTone}`}>
              {loading ? "Быстрая проверка..." : report?.status || "Ошибка"}
            </span>
          </div>
          <div className={styles.scoreRow}>
            <div>
              <strong>{report?.vpnScore ?? "-"}/10</strong>
              <span>VPN Score</span>
            </div>
            <div>
              <strong>{report?.anonymityScore ?? "-"}/10</strong>
              <span>Анонимность</span>
            </div>
            <div>
              <strong>{report?.speedScore ?? "-"}/10</strong>
              <span>Скорость</span>
            </div>
          </div>
          <div className={styles.cardHeader}>
            <span>Уровень риска</span>
            <span className={`${styles.status} ${riskTone}`}>
              {loading ? "..." : report?.riskLevel || "Нет данных"}
            </span>
          </div>
          <p className={styles.cardNote}>
            {liveStatus}. Последнее обновление: {lastUpdated || "еще не выполнено"}.
          </p>
          <p className={styles.cardNote}>
            Важно: сайт умеет очень быстро замечать смену IP и сетевых признаков, но ни один
            браузерный сервис не может гарантировать обнаружение абсолютно каждого VPN,
            если его IP выглядит как обычная домашняя сеть.
          </p>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <span>IP и локация</span>
            <button className={styles.refreshBtn} onClick={() => window.location.reload()}>
              Обновить
            </button>
          </div>
          {loading ? (
            <p className={styles.loading}>Получаю IP и геоданные...</p>
          ) : error ? (
            <p className={styles.error}>{error}</p>
          ) : (
            <div className={styles.infoList}>
              <div><span>IP</span><strong>{report?.ip}</strong></div>
              <div><span>Версия</span><strong>{report?.ipVersion}</strong></div>
              <div><span>Страна</span><strong>{report?.country}</strong></div>
              <div><span>Город</span><strong>{report?.city}</strong></div>
              <div><span>Регион</span><strong>{report?.region}</strong></div>
              <div><span>Почтовый индекс</span><strong>{report?.postalCode}</strong></div>
              <div><span>Широта</span><strong>{report?.latitude}</strong></div>
              <div><span>Долгота</span><strong>{report?.longitude}</strong></div>
              <div><span>Часовой пояс IP</span><strong>{report?.timezone}</strong></div>
            </div>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <span>Провайдер и ASN</span>
            <span className={styles.caption}>Geo.IPify + IPinfo</span>
          </div>
          {loading ? (
            <p className={styles.loading}>Собираю данные о провайдере...</p>
          ) : error ? (
            <p className={styles.error}>{error}</p>
          ) : (
            <div className={styles.infoList}>
              <div><span>ISP</span><strong>{report?.isp}</strong></div>
              <div><span>Организация</span><strong>{report?.org}</strong></div>
              <div><span>Тип провайдера</span><strong>{report?.providerType}</strong></div>
              <div><span>ASN</span><strong>{report?.asn}</strong></div>
              <div><span>AS Name</span><strong>{report?.asName}</strong></div>
              <div><span>AS Domain</span><strong>{report?.asDomain}</strong></div>
              <div><span>AS Route</span><strong>{report?.asRoute}</strong></div>
              <div><span>AS Type</span><strong>{report?.asType}</strong></div>
              <div><span>Hostname</span><strong>{report?.hostname}</strong></div>
              <div><span>Anycast</span><strong>{report?.anycast}</strong></div>
            </div>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <span>Утечки и приватность</span>
            <span className={styles.caption}>
              {leakScanState === "running" ? "Deep scan..." : "WebRTC + privacy"}
            </span>
          </div>
          {loading && !clientMetrics ? (
            <p className={styles.loading}>Запускаю быстрый анализ...</p>
          ) : error ? (
            <p className={styles.error}>{error}</p>
          ) : (
            <div className={styles.infoList}>
              <div><span>Риск утечки</span><strong>{clientMetrics?.leakRisk ? "Есть признаки" : "Не найден"}</strong></div>
              <div><span>Локальные кандидаты</span><strong>{clientMetrics?.localCandidates.length ? clientMetrics.localCandidates.join(", ") : "Не обнаружены"}</strong></div>
              <div><span>Публичные кандидаты</span><strong>{clientMetrics?.publicCandidates.length ? clientMetrics.publicCandidates.join(", ") : "Не обнаружены"}</strong></div>
              <div><span>VPN flag</span><strong>{report?.rawSignals.vpn ? "Да" : "Нет"}</strong></div>
              <div><span>Proxy flag</span><strong>{report?.rawSignals.proxy ? "Да" : "Нет"}</strong></div>
              <div><span>Tor flag</span><strong>{report?.rawSignals.tor ? "Да" : "Нет"}</strong></div>
              <div><span>Relay flag</span><strong>{report?.rawSignals.relay ? "Да" : "Нет"}</strong></div>
              <div><span>Hosting flag</span><strong>{report?.rawSignals.hosting ? "Да" : "Нет"}</strong></div>
              <div><span>Privacy service</span><strong>{report?.rawSignals.service}</strong></div>
              <div><span>Таймзона совпадает</span><strong>{report?.timezoneMismatch ? "Нет" : "Да"}</strong></div>
            </div>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <span>Скорость и отклик</span>
            <span className={styles.caption}>Realtime</span>
          </div>
          {loading && !clientMetrics ? (
            <p className={styles.loading}>Измеряю скорость отклика...</p>
          ) : error ? (
            <p className={styles.error}>{error}</p>
          ) : (
            <div className={styles.infoList}>
              <div><span>Задержка</span><strong>{clientMetrics?.latencyMs} мс</strong></div>
              <div><span>Speed score</span><strong>{report?.speedScore}/10</strong></div>
              <div><span>Downlink</span><strong>{clientMetrics?.downlink ? `${clientMetrics.downlink} Mbps` : "Недоступно"}</strong></div>
              <div><span>Часовой пояс браузера</span><strong>{clientMetrics?.browserTimezone}</strong></div>
              <div><span>Публичный IP браузера</span><strong>{clientMetrics?.publicIp}</strong></div>
            </div>
          )}
        </article>

        <article className={`${styles.card} ${styles.wide}`}>
          <div className={styles.cardHeader}>
            <span>Анализ и рекомендации</span>
            <span className={styles.caption}>Подробный отчет</span>
          </div>
          {loading ? (
            <p className={styles.loading}>Показываю основной отчет...</p>
          ) : error ? (
            <p className={styles.error}>{error}</p>
          ) : (
            <div className={styles.columns}>
              <div>
                <h3>Сигналы</h3>
                <ul className={styles.list}>
                  {report?.flags.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h3>Рекомендации</h3>
                <ul className={styles.list}>
                  {report?.recommendations.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <span>Документация</span>
            <span className={styles.caption}>Пояснение терминов</span>
          </div>
          <p className={styles.cardNote}>
            Простое русское объяснение всех полей: IP, ASN, hosting, WebRTC leak,
            privacy flags, таймзона, риск и итоговые оценки.
          </p>
          <Link href="/documentation" className={styles.primaryBtn}>
            Открыть /documentation
          </Link>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <span>AI Помощник</span>
            <span className={styles.caption}>Только по теме IP/VPN</span>
          </div>
          <p className={styles.cardNote}>
            Отдельный русскоязычный помощник администратора, который объясняет только
            IP, VPN, proxy, Tor, ASN, утечки и сетевую приватность.
          </p>
          <Link href="/ai" className={styles.primaryBtn}>
            Открыть /ai
          </Link>
        </article>
      </section>

      <a className={styles.telegramFloat} href={telegramUrl} target="_blank" rel="noreferrer">
        Telegram Admin
      </a>
    </main>
  );
}
