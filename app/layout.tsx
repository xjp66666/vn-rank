import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "VN Rank - Simple visual novel rankings",
    description:
      "A transparent visual novel leaderboard combining VNDB and Bangumi community scores.",
    openGraph: {
      title: "VN Rank - Simple visual novel rankings",
      description:
        "One ranking built from VNDB and Bangumi.",
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og-simple.png`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "VN Rank - Simple visual novel rankings",
      description:
        "One ranking built from VNDB and Bangumi.",
      images: [`${origin}/og-simple.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
