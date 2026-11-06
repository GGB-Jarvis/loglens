import type { Metadata, Viewport } from "next";
import { RunProvider } from "@/components/providers/run-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "LogLens — 日志证据工作台",
  description:
    "LogLens 把日志工作重组为运行、诊断、报告、日志、配置五个页面。统计由 DuckDB 计算，结论由证据支撑，每条判断都能回到文件:行号。",
  applicationName: "LogLens",
};

export const viewport: Viewport = {
  themeColor: "#f3f6fb",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <RunProvider>{children}</RunProvider>
      </body>
    </html>
  );
}
