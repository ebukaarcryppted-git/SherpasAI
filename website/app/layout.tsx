import type { Metadata } from "next";
import { Squada_One, Manrope, Titan_One, Fira_Code } from "next/font/google";
import "./globals.css";

/**
 * SK-Modernist -> Manrope (clean modern grotesk, same body-text role).
 * "Glitz" wordmark (SHERPAS AGENT ASP) -> Titan One — Glitz itself is a
 * paid commercial display face; Titan One is the closest free equivalent
 * on Google Fonts (chunky, rounded, heavy balloon-shaped letterforms).
 * Every other file only references the --font-heading/--font-body/
 * --font-wordmark variables below, so a future swap to the licensed
 * Glitz .woff2 files is a one-line change in globals.css.
 */
const squadaOne = Squada_One({
  variable: "--font-squada-one",
  subsets: ["latin"],
  weight: ["400"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const titanOne = Titan_One({
  variable: "--font-titan-one",
  subsets: ["latin"],
  weight: ["400"],
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Sherpas Agent ASP: Diagnose failed transactions on Ethereum & X Layer",
  description:
    "Paste a transaction hash. Get a plain-language diagnosis of why it failed and how to fix it, read straight from live Ethereum and X Layer chain data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${squadaOne.variable} ${manrope.variable} ${titanOne.variable} ${firaCode.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text font-body">
        {children}
      </body>
    </html>
  );
}
