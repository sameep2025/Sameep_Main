"use client";

import { useEffect, useState } from "react";
import { getSiteContact } from "../services/api";

export default function PrivacyPolicyContact() {
  const [siteContact, setSiteContact] = useState({
    addressLine1: "",
    addressLine2: "",
  });

  useEffect(() => {
    let isMounted = true;

    async function fetchSiteContact() {
      try {
        const data = await getSiteContact();
        if (!isMounted) return;

        setSiteContact({
          addressLine1: data?.addressLine1 || "",
          addressLine2: data?.addressLine2 || "",
        });
      } catch (error) {
        console.error(error);
      }
    }

    fetchSiteContact();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <address>
      <strong>YNOT</strong>
      <span>Operated by Taxiemall Technologies Private Limited</span>
      {siteContact.addressLine1 ? <span>{siteContact.addressLine1}</span> : null}
      {siteContact.addressLine2 ? <span>{siteContact.addressLine2}</span> : null}
      <a href="https://ynot.co.in" target="_blank" rel="noreferrer">
        ynot.co.in
      </a>
      <a href="mailto:ynotapp.2026@gmail.com">ynotapp.2026@gmail.com</a>
      <a href="tel:+919381520396">+91 93815 20396</a>
      <span>India</span>
    </address>
  );
}
