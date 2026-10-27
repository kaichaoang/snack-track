import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnackTrack",
  description: "Track calories and nutrients toward a weight-loss goal. Snap a photo to estimate.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SnackTrack", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f7d4f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
