"use client";

import "./Contact.css";

export default function Contact() {
  return (
    <section className="contact-wrapper" id="contact">

      {/* LEFT CONTENT */}
      <div className="contact-left">
        <h2 className="contact-title">Get in Touch</h2>

        <p className="contact-desc">
          Have questions about our driving courses? <br />
          Reach out to us anytime — we’re here to assist you!
        </p>

        <div className="contact-info">
          <p><strong>📍 Address:</strong> Shaikpet, Hyderabad</p>
          <p><strong>📞 Phone:</strong> +91 6309719521</p>
          <p><strong>✉️ Email:</strong> info@tirumaladrivingschool.com</p>
        </div>
      </div>

      {/* RIGHT FORM */}
      <form
        className="contact-form"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="form-group">
          <input type="text" required />
          <label>Full Name</label>
        </div>

        <div className="form-group">
          <input type="email" required />
          <label>Email Address</label>
        </div>

        <div className="form-group">
          <input type="tel" required />
          <label>Phone Number</label>
        </div>

        <div className="form-group">
          <input type="text" required />
          <label>Your Message</label>
        </div>

        <button type="submit" className="contact-btn">
          Send Message
        </button>
      </form>

    </section>
  );
}
