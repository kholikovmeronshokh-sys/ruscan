import type { Metadata } from "next";
import { DocumentationPage } from "@/components/documentation-page";

export const metadata: Metadata = {
  title: "Документация | РусСкан VPN",
  description: "Подробное объяснение всех полей и показателей проверки IP и VPN.",
};

export default function DocumentationRoute() {
  return <DocumentationPage />;
}
