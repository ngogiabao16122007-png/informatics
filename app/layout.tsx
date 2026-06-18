import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Integrated BCMA-CPOE-EHR Demo",
  description: "Educational medication workflow demo with fictional data and mock safety checks."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
