import "./globals.css";

export const metadata = {
  title: "BioAgentic — Agentic Biotech Research",
  description:
    "Multi-agent research pipeline: clinical trials, literature mining, hypothesis generation & debate powered by Grok.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
