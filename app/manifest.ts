import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "拿快递 · 我的取件清单",
    short_name: "拿快递",
    description: "一眼分清待拿和已拿，数据仅保存在本机。",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1eb",
    theme_color: "#ed7a2c",
    orientation: "portrait",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
