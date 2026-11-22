import Link from "next/link";
import Image from "next/image";
import SalonPromotionalPopup from "../../components/SalonPromotionalPopup";
import { salonLandingContent as content } from "../../content/salonManagementSoftware.mjs";
import { fetchPublishedPromotionalPosters } from "../../services/promotionalPosters.mjs";
import {
  PRODUCTION_SITE_ORIGIN,
  isProductionIndexingEnabled,
} from "../../utils/siteEnvironment.mjs";

export const revalidate = 300;

const canonicalUrl = `${PRODUCTION_SITE_ORIGIN}/${content.slug}`;
const indexingEnabled = isProductionIndexingEnabled();
const salonOnboardingUrl = "/onboarding?category=salon-spa";

export const metadata = {
  title: content.metadata.title,
  description: content.metadata.description,
  alternates: { canonical: canonicalUrl },
  robots: {
    index: indexingEnabled,
    follow: indexingEnabled,
    googleBot: {
      index: indexingEnabled,
      follow: indexingEnabled,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: canonicalUrl,
    siteName: "YNOT",
    title: content.metadata.title,
    description: content.metadata.description,
  },
  twitter: {
    card: "summary",
    title: content.metadata.title,
    description: content.metadata.description,
  },
};

function buildStructuredData() {
  const organizationId = `${PRODUCTION_SITE_ORIGIN}/#organization`;
  const offers = content.plans.map((plan) => ({
    "@type": "Offer",
    name: plan.name,
    description: plan.description,
    price: plan.price.replace(/[^0-9]/g, ""),
    priceCurrency: "INR",
    url: canonicalUrl,
    availability: "https://schema.org/InStock",
  }));

  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": organizationId,
      name: "YNOT",
      url: PRODUCTION_SITE_ORIGIN,
      email: content.contact.email,
      telephone: content.contact.phoneDisplay,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "YNOT Salon Management Software",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: content.metadata.description,
      url: canonicalUrl,
      audience: {
        "@type": "BusinessAudience",
        audienceType: "Small salons and beauty parlours in India",
      },
      featureList: content.features.map((feature) => feature.title),
      offers,
      provider: {
        "@id": organizationId,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "YNOT",
          item: PRODUCTION_SITE_ORIGIN,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Salon Management Software",
          item: canonicalUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: content.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ];
}

const iconPaths = {
  website: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 6h.01M10 6h.01"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2"/></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M7.5 8C5 8 5 4 7.5 4 10 4 12 8 12 8s2-4 4.5-4S19 8 16.5 8"/></>,
  customer: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></>,
  membership: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h4M7 14h7M17 9v6"/></>,
  staff: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  analytics: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 7 6-4 6 6 5-5"/></>,
  whatsapp: <><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.44L3 21l2.06-5.4A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.2 8.2c.5 4 3.6 7.1 7.6 7.6"/></>,
};

function FeatureIcon({ name }) {
  return (
    <span className="salonFeatureIcon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {iconPaths[name] || iconPaths.website}
      </svg>
    </span>
  );
}

export default async function SalonManagementSoftwarePage() {
  const structuredData = JSON.stringify(buildStructuredData()).replace(/</g, "\\u003c");
  const promotionalPosters = await fetchPublishedPromotionalPosters();

  return (
    <div className="salonLanding">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />
      <SalonPromotionalPopup
        posters={promotionalPosters}
        signupHref={salonOnboardingUrl}
        demoHref={content.contact.phoneHref}
      />

      <header className="salonHeader">
        <div className="salonShell salonHeaderInner">
          <Link href="/" className="salonBrand" aria-label="YNOT home">
            <span className="brandMark">Y</span>
            <span className="brandWordmark">YNOT</span>
          </Link>
          <nav className="salonNav" aria-label="Salon software page">
            <a href="#features">Features</a>
            {promotionalPosters.length ? <a href="#highlights">Highlights</a> : null}
            <a href="#pricing">Pricing</a>
            <a href="#faqs">FAQs</a>
          </nav>
          <div className="salonHeaderActions">
            <a className="salonDemoButton" href={content.contact.phoneHref}>
              <span className="salonWideLabel">Free demo</span>
              <span className="salonShortLabel">Demo</span>
            </a>
            <Link className="salonSignupButton" href={salonOnboardingUrl}>
              <span className="salonWideLabel">Sign Up Now</span>
              <span className="salonShortLabel">Sign Up</span>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="salonHero">
          <div className="salonShell salonHeroGrid">
            <div className="salonHeroCopy">
              <p className="salonEyebrow">{content.hero.eyebrow}</p>
              <h1>{content.hero.title}</h1>
              <p className="salonHeroDescription">{content.hero.description}</p>
              <div className="salonHeroActions">
                <Link className="salonPrimaryButton" href={salonOnboardingUrl}>Sign Up Now</Link>
                <a className="salonSecondaryButton" href={content.contact.phoneHref}>Get a free demo</a>
                <a className="salonTextLink" href="#pricing">
                  See pricing <span aria-hidden="true">↓</span>
                </a>
              </div>
              <p className="salonFinePrint">No card details required to request a demo.</p>
            </div>

            <aside className="salonHeroPanel" aria-label="YNOT starting price">
              <p>Simple annual pricing</p>
              <strong>Starts at</strong>
              <span>{content.hero.price}</span>
              <ul>
                <li>Mobile-friendly operation</li>
                <li>Digital billing and salon analytics</li>
                <li>Optional membership and WhatsApp add-ons</li>
              </ul>
            </aside>
          </div>
        </section>

        <section className="salonProofStrip" aria-label="Core salon capabilities">
          <div className="salonShell">
            <span>Website</span>
            <span>Billing</span>
            <span>Customers</span>
            <span>Staff</span>
            <span>Insights</span>
          </div>
        </section>

        <section className="salonSection salonOwnerSection" aria-labelledby="salon-owner-title">
          <div className="salonShell salonOwnerLayout">
            <div>
              <p className="salonKicker">{content.ownerGuide.eyebrow}</p>
              <h2 id="salon-owner-title">{content.ownerGuide.title}</h2>
              <p className="salonOwnerDescription">{content.ownerGuide.description}</p>
            </div>
            <ul className="salonOwnerPoints">
              {content.ownerGuide.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="salonSection" id="features">
          <div className="salonShell">
            <div className="salonSectionHeading">
              <div>
                <p className="salonKicker">One connected toolkit</p>
                <h2>Daily salon work, without scattered systems</h2>
              </div>
              <p>
                Use one mobile-friendly platform for salon billing, appointments,
                customers, staff, loyalty and day-to-day business insights.
              </p>
            </div>

            <div className="salonFeatureGrid">
              {content.features.map((feature) => (
                <article className="salonFeatureCard" key={feature.title}>
                  <FeatureIcon name={feature.icon} />
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {promotionalPosters.length ? (
          <section className="salonSection salonHighlightsSection" id="highlights">
            <div className="salonShell">
              <div className="salonSectionHeading">
                <div>
                  <p className="salonKicker">YNOT Promotional Highlights</p>
                  <h2>See how YNOT supports the salon journey</h2>
                </div>
                <p>
                  Product highlights complement the detailed feature information on this page.
                </p>
              </div>
              <div className="salonPosterGrid">
                {promotionalPosters.map((poster, index) => (
                  <figure className="salonPosterCard" key={poster.id}>
                    <Image
                      src={poster.imageUrl}
                      alt={poster.altText}
                      width={poster.width}
                      height={poster.height}
                      sizes="(max-width: 760px) calc(100vw - 28px), 50vw"
                      quality={82}
                      priority={index === 0}
                    />
                    <figcaption>{poster.altText}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="salonSection salonPricingSection" id="pricing">
          <div className="salonShell">
            <div className="salonSectionHeading salonSectionHeadingLight">
              <div>
                <p className="salonKicker">Clear annual pricing</p>
                <h2>Start with the essentials. Add what your salon needs.</h2>
              </div>
              <p>Prices shown are annual software prices. Contact YNOT to confirm setup requirements.</p>
            </div>

            <div className="salonPricingGrid">
              {content.plans.map((plan) => (
                <article
                  className={`salonPriceCard${plan.featured ? " salonPriceCardFeatured" : ""}`}
                  key={plan.name}
                >
                  {plan.featured ? <span className="salonPopularTag">Flexible choice</span> : null}
                  <h3>{plan.name}</h3>
                  <div className="salonPrice">
                    <strong>{plan.price}</strong>
                    <span>{plan.cadence}</span>
                  </div>
                  <p>{plan.description}</p>
                  <ul>
                    {plan.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                  <a href={content.contact.emailHref}>Ask about this plan</a>
                </article>
              ))}
            </div>

            <div className="salonAddOns">
              <div>
                <p className="salonKicker">Optional add-ons</p>
                <h3>Choose one or combine both</h3>
              </div>
              {content.addOns.map((addOn) => (
                <article key={addOn.name}>
                  <div>
                    <h4>{addOn.name}</h4>
                    <strong>{addOn.price}</strong>
                  </div>
                  <p>{addOn.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="salonSection salonFaqSection" id="faqs">
          <div className="salonShell salonFaqLayout">
            <div className="salonFaqIntro">
              <p className="salonKicker">Questions, answered</p>
              <h2>What salon owners usually ask</h2>
              <p>Need help choosing a plan? Talk to the YNOT team for a guided demo.</p>
            </div>
            <div className="salonFaqList">
              {content.faqs.map((faq) => (
                <details key={faq.question}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="salonDemoSection">
          <div className="salonShell salonDemoCard">
            <div>
              <p className="salonKicker">See YNOT in action</p>
              <h2>Ready for a simpler way to run your salon?</h2>
              <p>Request a free demo and discuss the right setup for your business.</p>
            </div>
            <div className="salonDemoActions">
              <Link className="salonPrimaryButton" href={salonOnboardingUrl}>Sign Up Now</Link>
              <a className="salonSecondaryButton salonSecondaryButtonDark" href={content.contact.phoneHref}>
                Free demo: {content.contact.phoneDisplay}
              </a>
              <a className="salonEmailLink" href={content.contact.emailHref}>
                {content.contact.email}
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="salonFooter">
        <div className="salonShell salonFooterInner">
          <div>
            <Link href="/" className="salonBrand">
              <span className="brandMark">Y</span>
              <span className="brandWordmark">YNOT</span>
            </Link>
            <p>Practical digital tools for service businesses in India.</p>
          </div>
          <nav aria-label="Footer">
            <Link href="/">Home</Link>
            <Link href="/onboarding">Set up your business</Link>
            <Link href="/privacy-policy">Privacy Policy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
