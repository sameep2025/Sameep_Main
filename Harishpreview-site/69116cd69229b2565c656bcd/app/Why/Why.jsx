"use client";

import "./Why.css";
import {
  FaBolt,
  FaCertificate,
  FaShieldAlt,
  FaCalendarAlt,
  FaHandshake,
  FaGem,
} from "react-icons/fa";

export default function Why() {
  const features = [
    {
      icon: <FaBolt />,
      title: "Efficient Learning",
      desc: "Structured lessons for quick, effective skill acquisition.",
    },
    {
      icon: <FaCertificate />,
      title: "Certified Instructors",
      desc: "Learn from the best, with experienced and patient teachers.",
    },
    {
      icon: <FaShieldAlt />,
      title: "Safety First",
      desc: "Modern vehicles and rigorous safety protocols.",
    },
    {
      icon: <FaCalendarAlt />,
      title: "Flexible Scheduling",
      desc: "Lessons designed to fit your busy lifestyle.",
    },
    {
      icon: <FaHandshake />,
      title: "Personalized Approach",
      desc: "Tailored lessons to meet individual learning needs.",
    },
    {
      icon: <FaGem />,
      title: "Great Value",
      desc: "Premium education at competitive, fair pricing.",
    },
  ];

  return (
    <section className="why-wrapper" id="whyus">
      <h2 className="why-title">
        Why Choose Tirumala Motor Driving School?
      </h2>

      <p className="why-subtitle">
        Experience the difference with our commitment to excellence,
        <br />
        safety, and customer satisfaction.
      </p>

      <div className="why-cards-container">
        {features.map((f, index) => (
          <div className="why-card" key={index}>
            <div className="why-icon">{f.icon}</div>
            <h3 className="why-card-title">{f.title}</h3>
            <p className="why-card-desc">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
