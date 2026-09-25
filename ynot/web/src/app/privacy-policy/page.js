import PrivacyPolicyContact from "../../components/PrivacyPolicyContact";

const policySections = [
  {
    title: "1. Information We Collect",
    intro: "Depending on the YNOT services being used, we may collect information such as:",
    groups: [
      {
        heading: "Business Information",
        items: [
          "Business name",
          "Business category",
          "Business address and service locations",
          "Contact details",
          "Business logo and images",
          "Products and services",
          "Prices, packages, offers and other business information",
          "Staff information provided by the business",
          "Business website and social media information",
        ],
      },
      {
        heading: "Account Information",
        items: [
          "Name",
          "Mobile number",
          "Email address",
          "Login and account-related information",
          "Information required to authenticate and manage access to YNOT",
        ],
      },
      {
        heading: "Customer and Transaction Information",
        paragraphs: [
          "Businesses using YNOT may provide or generate customer-related information through the platform, including:",
        ],
        items: [
          "Customer mobile number",
          "Customer information entered by the business",
          "Billing and transaction information",
          "Services or products purchased",
          "Loyalty points earned and redeemed",
          "Customer visit and transaction history",
          "Payment mode information",
        ],
      },
    ],
    paragraphs: [
      "YNOT does not require businesses to provide payment card numbers or banking credentials as part of normal customer billing records.",
    ],
  },
  {
    title: "2. WhatsApp Business and Meta Integration",
    paragraphs: [
      "YNOT may allow businesses to connect their WhatsApp Business Account or other Meta business assets to YNOT.",
      "When a business chooses to connect its WhatsApp Business Account, YNOT may receive and process information made available through Meta's APIs, depending on the permissions granted by the business.",
      "This information may include:",
    ],
    items: [
      "WhatsApp Business Account identifiers",
      "WhatsApp Business phone number identifiers",
      "Business phone number and display information",
      "Messaging account configuration and status",
      "Message template information and approval status",
      "Information required to send and manage WhatsApp messages on behalf of the connected business",
      "Technical information required to maintain the integration",
    ],
    closingParagraphs: [
      "YNOT uses this information to provide the WhatsApp-related functionality requested by the business, such as sending supported business communications and managing the business's WhatsApp integration.",
      "Connecting a WhatsApp Business Account to YNOT is optional. Businesses may disconnect or stop using the integration subject to the functionality provided by YNOT and Meta.",
      "YNOT does not sell WhatsApp Business Account information obtained through Meta APIs.",
    ],
  },
  {
    title: "3. How We Use Information",
    paragraphs: ["We may use information collected through YNOT to:"],
    items: [
      "Create and manage business accounts",
      "Provide business pages and online presence",
      "Provide billing functionality",
      "Send supported customer communications",
      "Operate loyalty and rewards features",
      "Provide sales and business analytics",
      "Provide staff and business-management functionality",
      "Enable and maintain WhatsApp Business integrations",
      "Provide customer support",
      "Monitor and improve the performance and security of our services",
      "Prevent misuse, fraud, or unauthorized access",
      "Comply with applicable legal and regulatory requirements",
      "Develop and improve YNOT products and services",
    ],
    closingParagraphs: [
      "We process information only for legitimate business purposes connected with providing and operating YNOT services and as otherwise permitted by applicable law.",
    ],
  },
  {
    title: "4. Business Customer Data",
    paragraphs: [
      "Businesses using YNOT may enter or generate information relating to their customers.",
      "Businesses are responsible for ensuring that they have the appropriate authority, consent, or other lawful basis required to collect customer information and use YNOT to communicate with their customers.",
      "YNOT processes such information for the purpose of providing its services to the business.",
      "Businesses must not use YNOT to send unlawful, misleading, abusive, unsolicited, or otherwise prohibited communications.",
      "Where WhatsApp services are used, businesses are also responsible for complying with applicable Meta and WhatsApp policies, including requirements concerning customer consent and permitted messaging.",
    ],
  },
  {
    title: "5. Sharing of Information",
    paragraphs: [
      "YNOT does not sell personal information.",
      "We may share or process information with service providers and technology partners when necessary to operate YNOT services.",
      "These may include providers supporting:",
    ],
    items: [
      "Cloud hosting and infrastructure",
      "Messaging and communication",
      "Meta and WhatsApp Business services",
      "Authentication and security",
      "Analytics and monitoring",
      "Payment services, where applicable",
    ],
    closingParagraphs: [
      "Information may also be disclosed where required by law, legal process, government authority, or where reasonably necessary to protect the rights, security, and integrity of YNOT, our businesses, users, or others.",
    ],
  },
  {
    title: "6. Data Security",
    paragraphs: [
      "We take reasonable technical and organizational measures designed to protect information against unauthorized access, alteration, disclosure, loss, or misuse.",
      "However, no internet-based service or electronic storage system can guarantee absolute security.",
      "Businesses are responsible for protecting their YNOT account credentials and restricting unauthorized access to their accounts.",
    ],
  },
  {
    title: "7. Data Retention",
    paragraphs: ["We retain information for as long as reasonably necessary to:"],
    items: [
      "Provide YNOT services",
      "Maintain business and transaction records",
      "Fulfil contractual obligations",
      "Resolve disputes",
      "Meet legal, accounting, security, and regulatory requirements",
    ],
    closingParagraphs: [
      "Retention periods may vary depending on the type of information and the purpose for which it is processed.",
      "When information is no longer reasonably required, we may delete, anonymize, or otherwise securely dispose of it, subject to applicable legal requirements.",
    ],
  },
  {
    title: "8. Data Deletion Requests",
    paragraphs: [
      "Users and businesses may request deletion of eligible personal information associated with their YNOT account.",
      "Requests may be submitted using the contact details provided below or through any data-deletion mechanism made available by YNOT.",
      "Before processing a request, we may need to verify the identity or authority of the person making the request.",
      "Certain information may need to be retained where required for legal, regulatory, security, fraud-prevention, accounting, or legitimate record-keeping purposes.",
      "We may also retain anonymized or aggregated information that does not reasonably identify an individual.",
    ],
  },
  {
    title: "9. Third-Party Services",
    paragraphs: [
      "YNOT may integrate with third-party platforms and services, including Meta and WhatsApp.",
      "Use of those services may also be subject to the respective third party's terms, privacy policies, and platform policies.",
      "YNOT is not responsible for the independent privacy practices of third-party services.",
    ],
  },
  {
    title: "10. Cookies and Technical Information",
    paragraphs: ["YNOT websites and applications may collect technical information such as:"],
    items: [
      "Browser and device information",
      "IP address",
      "Application and system logs",
      "Pages or features accessed",
      "Error and performance information",
    ],
    closingParagraphs: [
      "This information may be used to operate, secure, troubleshoot, analyze, and improve YNOT services.",
      "Where required by applicable law, YNOT will obtain appropriate consent for cookies or similar technologies.",
    ],
  },
  {
    title: "11. Children's Privacy",
    paragraphs: [
      "YNOT services are intended for businesses and users who are legally capable of using the services.",
      "YNOT does not knowingly collect personal information from children in circumstances where parental or guardian consent is legally required.",
      "If we become aware that such information has been collected improperly, we may take appropriate steps to delete it.",
    ],
  },
  {
    title: "12. Your Rights and Choices",
    paragraphs: [
      "Depending on applicable law, individuals may have rights concerning their personal information, including the right to request access, correction, deletion, or other permitted actions.",
      "Requests can be submitted using the contact information below.",
      "We may request information necessary to verify the request before taking action.",
    ],
  },
  {
    title: "13. Changes to This Privacy Policy",
    paragraphs: [
      "We may update this Privacy Policy periodically to reflect changes to YNOT services, technology, legal requirements, or business practices.",
      "When the policy is updated, the revised version will be published on this page with an updated “Last Updated” date.",
    ],
  },
];

export const metadata = {
  title: "Privacy Policy | YNOT",
  description:
    "Privacy Policy for YNOT services, including YNOT business services and WhatsApp Business integrations.",
};

function PolicySection({ section }) {
  return (
    <section className="privacyPolicySection">
      <h2>{section.title}</h2>
      {section.intro ? <p>{section.intro}</p> : null}
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.items ? (
        <ul>
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {section.groups?.map((group) => (
        <div key={group.heading} className="privacyPolicyGroup">
          <h3>{group.heading}</h3>
          {group.paragraphs?.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <ul>
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      {section.closingParagraphs?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="privacyPolicyPage">
      <header className="siteHeader privacyPolicyHeader">
        <div className="siteShell siteHeaderInner">
          <a className="brandButton" href="/">
            <span className="brandMark">Y</span>
            <span className="brandWordmark">YNOT</span>
          </a>
          <a className="navCtaButton" href="/onboarding">
            Set up business
          </a>
        </div>
      </header>

      <main className="privacyPolicyMain">
        <div className="siteShell">
          <article className="privacyPolicyDocument">
            <div className="privacyPolicyHero">
              <p className="sectionKicker">Legal</p>
              <h1>Privacy Policy</h1>
              <p className="privacyPolicyUpdated">Last Updated: September 25, 2026</p>
            </div>

            <div className="privacyPolicyIntro">
              <p>
                YNOT (“YNOT”, “we”, “our”, or “us”) provides digital business solutions
                that help businesses manage their online presence, customer interactions,
                billing, loyalty rewards, business information, and related services.
              </p>
              <p>
                This Privacy Policy explains how we collect, use, store, and protect
                information when businesses and users access YNOT websites, applications,
                services, and integrations, including integrations with Meta and WhatsApp
                Business.
              </p>
              <p>
                By using YNOT services, you acknowledge the practices described in this
                Privacy Policy.
              </p>
            </div>

            {policySections.map((section) => (
              <PolicySection key={section.title} section={section} />
            ))}

            <section className="privacyPolicySection privacyPolicyContact">
              <h2>14. Contact Us</h2>
              <p>
                For questions, concerns, or requests relating to this Privacy Policy or
                personal information processed through YNOT, please contact:
              </p>
              <PrivacyPolicyContact />
            </section>
          </article>
        </div>
      </main>

      <footer className="siteFooter privacyPolicyFooter">
        <div className="siteShell footerBottom">
          <p>© 2026 YNOT Go Online. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
