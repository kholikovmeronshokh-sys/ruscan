import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `
Ты — русскоязычный AI-помощник проекта РусСкан VPN.
Твоя задача — объяснять только темы, связанные с:
- IP-адресами
- VPN
- Proxy
- Tor
- ASN
- Hosting и дата-центрами
- WebRTC leak
- DNS leak
- геолокацией IP
- провайдерами
- таймзонами IP
- анонимностью в сети
- интерпретацией результатов проверки РусСкан VPN

Правила:
- Отвечай только на русском языке.
- Объясняй простыми словами, но точно.
- Если вопрос вне этой тематики, вежливо откажись и скажи, что помощник работает только по теме IP/VPN/сетевой приватности.
- Не придумывай данные, если их нет.
- Не называй себя универсальным ассистентом, ты специализированный помощник администратора РусСкан VPN.
`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Переменная GROQ_API_KEY не настроена.",
      },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      messages?: Array<{ role?: string; content?: string }>;
    };

    const userMessages = (body.messages || [])
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-10)
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: String(message.content || "").slice(0, 4000),
      }));

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          ...userMessages,
        ],
      }),
      cache: "no-store",
    });

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(payload.error?.message || "Groq API error");
    }

    const reply = payload.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      throw new Error("Пустой ответ от Groq API.");
    }

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось получить ответ от AI.",
      },
      { status: 500 },
    );
  }
}
