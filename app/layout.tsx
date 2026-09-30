git: error: couldn't create cache file '/var/folders/zz/zyxvpxvq6csfxvn_n00001yr0000gp/T/xcrun_db-r98BEVwR' (errno=Operation not permitted)
git: error: couldn't create cache file '/var/folders/zz/zyxvpxvq6csfxvn_n00001yr0000gp/T/xcrun_db-AY1U1DDL' (errno=Operation not permitted)
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JevGate · Agent Action Firewall",
  description: "A fast, typed Jev decision gate for approving, confirming, or blocking AI agent tool calls.",
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
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
