import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Resolvo — Your company knowledge workspace",
    template: "%s · Resolvo",
  },
  description:
    "A private AI knowledge workspace for your company, with trusted sources and grounded answers.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
