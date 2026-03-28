import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "РусСкан VPN",
    short_name: "РусСкан",
    description:
      "Проверка IP, VPN, ASN, WebRTC-утечек и сетевой приватности в формате PWA.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef6ff",
    theme_color: "#1677ff",
    lang: "ru",
    orientation: "portrait",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
