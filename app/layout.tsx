import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "일갈피 · 복잡한 할 일, 우선순위의 갈피를 잡다",
  description:
    "마감과 중요도, 오늘 남은 시간을 고려해 지금 가장 필요한 일부터 추천하는 AI 업무 우선순위 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
