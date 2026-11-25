import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perjanjian Kita — Sepakat dengan Hati",
  description:
    "Ruang untuk menyusun, menandatangani, dan mencetak surat perjanjian bersama.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
