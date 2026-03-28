"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./install-app-button.module.css";

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function detectPlatform() {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<DeferredInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [openHelp, setOpenHelp] = useState(false);
  const platform = useMemo(detectPlatform, []);

  useEffect(() => {
    const standalone =
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        // @ts-expect-error iOS Safari specific
        window.navigator.standalone === true);

    if (standalone) {
      setInstalled(true);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as DeferredInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setOpenHelp(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (promptEvent) {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setPromptEvent(null);
      return;
    }

    setOpenHelp((value) => !value);
  }

  const helpText =
    platform === "ios"
      ? "На iPhone откройте сайт в Safari, нажмите Поделиться и выберите «На экран Домой»."
      : platform === "android"
        ? "На Android откройте меню браузера и нажмите «Установить приложение» или «Добавить на главный экран»."
        : "Авто-установка обычно появляется только на телефоне и только после деплоя сайта по https. На компьютере это окно может не показываться.";

  if (installed) {
    return <span className={styles.badge}>Приложение установлено</span>;
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.button} onClick={() => void handleInstall()}>
        {promptEvent ? "Установить приложение" : "Как установить на телефон"}
      </button>
      {openHelp ? <div className={styles.help}>{helpText}</div> : null}
    </div>
  );
}
