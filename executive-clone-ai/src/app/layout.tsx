import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "経営者クローンAI",
  description: "経営者の思考を再現し、意思決定の速度を高める",
  robots: { index: false, follow: false }, // 社内限定ツールのため検索エンジン非公開
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
