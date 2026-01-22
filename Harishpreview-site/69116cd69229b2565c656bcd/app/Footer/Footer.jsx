"use client";

import "./Footer.css";
import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer-wrapper">
      <div className="footer-container">

        {/* BRAND */}
        <div className="footer-col">
          <h2 className="footer-logo">Tirumala Driving School</h2>
          <p className="footer-desc">
            Trusted by thousands for safe, expert and confidence-building
            driving training.
          </p>
        </div>

        {/* LINKS */}
        <div className="footer-col">
          <h3 className="footer-title">Quick Links</h3>
          <ul className="footer-links">
            <li><Link href="#home">Home</Link></li>
            <li><Link href="#courses">Courses</Link></li>
            <li><Link href="#whyus">Why Us</Link></li>
            <li><Link href="#about">About</Link></li>
            <li><Link href="#contact">Contact</Link></li>
          </ul>
        </div>

        {/* CONTACT */}
        <div className="footer-col">
          <h3 className="footer-title">Contact</h3>
          <p className="footer-text">📍 Shaikpet, Hyderabad</p>
          <p className="footer-text">📞 +91 6309719521</p>
          <p className="footer-text">✉️ info@tirumaladrivingschool.com</p>
        </div>

        {/* SOCIAL */}
        <div className="footer-col">
          <h3 className="footer-title">Follow Us</h3>

          <div className="footer-socials">
            <Image src="/fb.png" alt="Facebook" width={32} height={32} />
            <Image src="/insta.jpg" alt="Instagram" width={32} height={32} />
            <Image src="/youtube.png" alt="YouTube" width={32} height={32} />
          </div>
        </div>

      </div>

      <div className="footer-bottom">
        © 2025 Tirumala Driving School — All Rights Reserved.
      </div>
    </footer>
  );
}
