import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Weights scoped to brand-design-system.md §2's type scale only.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"], // Regular, Medium, SemiBold, Bold, ExtraBold
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "700"], // Regular, Bold
});

// Display face for headings/section titles only (brand-design-system.md
// §2) — Inter remains the body/label/data-table workhorse; Space Grotesk
// carries the page's visual personality without touching legibility-
// critical dense content.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"], // Medium, SemiBold, Bold
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
        className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} font-body bg-surface-white text-on-surface antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
