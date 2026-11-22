import "../styles/globals.css";
import {
  PRODUCTION_SITE_ORIGIN,
  getPublicSiteOrigin,
  isProductionIndexingEnabled,
} from "../utils/siteEnvironment.mjs";

const indexingEnabled = isProductionIndexingEnabled();
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;

export const metadata = {
  metadataBase: new URL(getPublicSiteOrigin()),
  title: "YNOT - Get Your Business Online",
  description: "YNOT helps service businesses build their online presence and manage daily operations.",
  applicationName: "YNOT",
  alternates: {
    canonical: `${PRODUCTION_SITE_ORIGIN}/`,
  },
  robots: {
    index: indexingEnabled,
    follow: indexingEnabled,
    noarchive: !indexingEnabled,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "YNOT",
    title: "YNOT - Get Your Business Online",
    description: "Digital tools for service businesses in India.",
  },
  twitter: {
    card: "summary",
    title: "YNOT - Get Your Business Online",
    description: "Digital tools for service businesses in India.",
  },
  verification: googleVerification ? { google: googleVerification } : undefined,
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
