import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Resolvo — Customer support, thoughtfully done", template: "%s · Resolvo" }, description: "Grounded answers, order updates, and a little less back-and-forth. An AI support workspace powered by your business knowledge." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
