/**
 * Root layout for the whole Next.js app.
 *
 * In the Next.js "App Router", this single component wraps every page: it
 * defines the surrounding <html>/<body> shell, loads the global stylesheet and
 * fonts, and sets the page metadata (browser tab title and description). Each
 * actual page is rendered into the {children} slot below.
 */
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css"; // Tailwind + global styles, applied app-wide

// Load the "Geist" fonts from local files (rather than a CDN) so the app works
// offline and avoids an extra network request. Each font is exposed as a CSS
// variable that Tailwind references further down via `font-sans`.
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900", // variable font: any weight from 100 (thin) to 900 (black)
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// Page metadata. Next.js turns this into the <title> and <meta> tags in the
// document head, which is what shows in the browser tab and in search results.
export const metadata: Metadata = {
  title: "Swiss Parcel Quick-Check",
  description:
    "Schweizer Parzellen auf der Karte nachschlagen: Zone, Fläche, EGRID und Denkmalschutz-Hinweise (ISOS/KGS) — mit persönlicher Watchlist.",
};

/**
 * The shell rendered around every page.
 *
 * @param children the current page's content, injected by Next.js
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="de" because the app's UI text is German (Swiss audience).
    <html lang="de">
      {/* Make both font variables available, then set the app-wide background,
          default font, text colour and font smoothing via Tailwind classes. */}
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-canvas font-sans text-ink-900 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
