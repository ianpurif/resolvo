import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Notifications } from "@/components/notifications";
import "./globals.css";

const manrope = localFont({
  src: "../public/fonts/manrope-variable.ttf",
  weight: "200 800",
  variable: "--font-manrope",
  display: "swap",
});
const editorial = localFont({
  src: [
    {
      path: "../public/fonts/instrument-serif-regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/instrument-serif-italic.ttf",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-editorial",
  display: "swap",
});
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: {
    default: "Resolvo — Your company knowledge workspace",
    template: "%s · Resolvo",
  },
  description:
    "A private AI knowledge workspace for your company, with trusted sources and grounded answers.",
  icons: { icon: "/resolvo-logo.png", apple: "/resolvo-logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${editorial.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
        <Notifications />
      </body>
    </html>
  );
}
