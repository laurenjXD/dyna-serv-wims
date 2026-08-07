import type { Metadata } from "next";
import { Fira_Sans, Outfit, Epilogue, Roboto_Mono } from "next/font/google";
import "./globals.css";

// Weights scoped to brand-design-system.md §2's type scale only.
const firaSans = Fira_Sans({
  variable: "--font-fira-sans",
  subsets: ["latin"],
  weight: ["600", "700"], // SemiBold, Bold
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400"], // Regular
});

const epilogue = Epilogue({
  variable: "--font-epilogue",
  subsets: ["latin"],
  weight: ["600"], // SemiBold
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
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
        className={`${firaSans.variable} ${outfit.variable} ${epilogue.variable} ${robotoMono.variable} font-body bg-surface-white text-on-surface antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
