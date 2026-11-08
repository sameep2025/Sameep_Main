import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BootstrapClient from "./BootstrapClient";
import VendorClientShell from "./VendorClientShell";
import { VendorProvider } from "./context/VendorContext";
import { resolveVendorRequestContext } from "./utils/vendorRequestContext.server";
import {
  buildVendorDescription,
  buildVendorSchema,
  buildVendorTitle,
  getVendorPrimaryImage,
} from "./utils/vendorSeo";

const sharedIcons = {
  icon: "/favicon.svg",
  shortcut: "/favicon.svg",
  apple: "/favicon.svg",
};

export async function generateMetadata() {
  const { vendorContext, pageUrl, isIndexable } = await resolveVendorRequestContext();

  if (!vendorContext) {
    return {
      title: "Ynot Vendor Preview",
      description: "Explore local business profiles on Ynot.",
      icons: sharedIcons,
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = buildVendorTitle(vendorContext);
  const description = buildVendorDescription(vendorContext);
  const image = getVendorPrimaryImage(vendorContext) || "/favicon.svg";
  const metadataBase = pageUrl ? new URL(pageUrl) : undefined;
  const resolvedImage =
    image && metadataBase && !/^https?:\/\//i.test(image) ? new URL(image, metadataBase).toString() : image;

  return {
    title,
    description,
    metadataBase,
    icons: sharedIcons,
    alternates: isIndexable && pageUrl ? { canonical: pageUrl } : undefined,
    openGraph: {
      title,
      description,
      url: pageUrl || undefined,
      type: "website",
      images: resolvedImage ? [{ url: resolvedImage }] : undefined,
    },
    twitter: {
      card: resolvedImage ? "summary_large_image" : "summary",
      title,
      description,
      images: resolvedImage ? [resolvedImage] : undefined,
    },
    robots: isIndexable
      ? {
          index: true,
          follow: true,
        }
      : {
          index: false,
          follow: false,
        },
  };
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default async function RootLayout({ children }) {
  const { vendorContext, pageUrl } = await resolveVendorRequestContext();
  const seoSchema = buildVendorSchema(vendorContext, pageUrl);

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {seoSchema ? (
          <script
            type="application/ld+json"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: JSON.stringify(seoSchema) }}
          />
        ) : null}
        <VendorProvider vendor={vendorContext}>
          <BootstrapClient />
          <VendorClientShell>
            {children}
          </VendorClientShell>
        </VendorProvider>
      </body>
    </html>
  );
}
