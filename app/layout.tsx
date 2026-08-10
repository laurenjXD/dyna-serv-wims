import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
        className={`${inter.variable} ${jetbrainsMono.variable} font-body bg-surface-white text-on-surface antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
