import type { Metadata } from "next";
import { AiPage } from "@/components/ai-page";

export const metadata: Metadata = {
  title: "AI Помощник | РусСкан VPN",
  description: "Русскоязычный AI-помощник по темам IP, VPN, ASN, hosting и WebRTC leak.",
};

export default function AiRoute() {
  return <AiPage />;
}
