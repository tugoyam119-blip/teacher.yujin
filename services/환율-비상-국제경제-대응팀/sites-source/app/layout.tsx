import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "환율 비상! 국제경제 대응팀",
  description: "환율과 국제경제 4단원 서버형 수행평가",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
