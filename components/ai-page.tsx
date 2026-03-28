"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import styles from "./info-pages.module.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const starterQuestions = [
  "Что означает ASN и зачем он нужен?",
  "Почему сайт считает, что у меня VPN?",
  "Что такое WebRTC leak простыми словами?",
  "Чем отличается hosting IP от обычного провайдера?",
];

export function AiPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Я AI-помощник РусСкан VPN. Я объясняю только темы IP, VPN, proxy, Tor, ASN, hosting, утечек WebRTC, таймзоны, провайдеров и результатов проверки сайта.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event?: FormEvent<HTMLFormElement>, question?: string) {
    event?.preventDefault();
    const content = (question ?? input).trim();
    if (!content || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages,
        }),
      });

      const payload = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok || !payload.reply) {
        throw new Error(payload.error || "Не удалось получить ответ от AI.");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.reply as string,
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Произошла ошибка при обращении к AI.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <TopNav />
      <section className={styles.hero}>
        <span className={styles.kicker}>AI Помощник РусСкан VPN</span>
        <h1>Задайте вопрос по IP, VPN и утечкам</h1>
        <p>
          Этот помощник отвечает только по теме анализа IP, VPN, proxy, Tor, ASN,
          hosting, утечек WebRTC, таймзоны и сетевой приватности. Его создал администратор
          РусСкан VPN для объяснения результатов простым языком.
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.primaryBtn}>
            Вернуться к проверке
          </Link>
          <Link href="/documentation" className={styles.secondaryBtn}>
            Открыть документацию
          </Link>
        </div>
      </section>

      <section className={styles.stack}>
        <article className={styles.card}>
          <h2>Быстрые вопросы</h2>
          <div className={styles.quickGrid}>
            {starterQuestions.map((question) => (
              <button
                key={question}
                type="button"
                className={styles.quickButton}
                onClick={() => void handleSubmit(undefined, question)}
              >
                {question}
              </button>
            ))}
          </div>
        </article>

        <article className={styles.card}>
          <h2>Чат</h2>
          <div className={styles.chatBox}>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === "assistant" ? styles.assistantBubble : styles.userBubble
                }
              >
                {message.content}
              </div>
            ))}
            {loading ? <div className={styles.assistantBubble}>AI думает...</div> : null}
          </div>
          <form className={styles.chatForm} onSubmit={handleSubmit}>
            <textarea
              className={styles.textarea}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Например: почему hosting IP часто похож на VPN?"
              rows={4}
            />
            <button className={styles.primaryBtn} type="submit" disabled={loading}>
              Отправить вопрос
            </button>
          </form>
          {error ? <p className={styles.error}>{error}</p> : null}
        </article>
      </section>
    </main>
  );
}
