import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "일갈피 · 복잡한 하루 속, 지금 해야 할 일부터",
  description:
    "마감과 중요도, 이날 쓸 수 있는 시간을 고려해 지금 가장 필요한 일부터 추천하는 우선순위 플래너",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
