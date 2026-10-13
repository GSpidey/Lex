import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lex Workspace",
  description: "Managed legal-access operations for Nigeria",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="legal-shell">
          <nav aria-label="Legal and support">
            <a href="/legal/">Legal Centre</a>
            <a href="/support/">Support</a>
            <a href="/account-deletion/">Account and data requests</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
