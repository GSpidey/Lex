import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Lex Workspace", description: "Managed legal-access operations for Nigeria" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
