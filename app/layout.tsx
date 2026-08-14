import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Glacial Indifference & Etna Sans Serif font variable loading
const fontGlacial = Inter({
  variable: "--font-glacial",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const fontEtna = Inter({
  variable: "--font-etna",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Dyna-Serv WIMS",
  description: "Dyna-Serv Warehouse Inventory Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${fontEtna.variable} ${fontGlacial.variable} font-body bg-background text-text-primary antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
