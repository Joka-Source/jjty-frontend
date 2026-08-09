import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "JJTY — capture, not commands";
const description =
  "JJTY is building a device-owned, offline-first Android beta and Linux developer preview for 31 August 2026.";

export const metadata: Metadata = {
  metadataBase: new URL("https://jjty.in"),
  title,
  description,
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-image-preview": "none",
      "max-snippet": 0,
      "max-video-preview": 0,
    },
  },
  alternates: { canonical: "/" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: "https://jjty.in",
    siteName: "JJTY",
    title,
    description,
    images: [
      {
        url: "https://jjty.in/og.png",
        width: 1729,
        height: 910,
        alt: "JJTY. Capture, not commands. Android beta and Linux developer preview — 31 August 2026.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["https://jjty.in/og.png"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f2ecdd",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
