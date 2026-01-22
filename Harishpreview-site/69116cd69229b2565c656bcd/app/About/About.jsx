"use client";

import "./About.css";
import {
  FaBullseye,
  FaEye,
  FaStar,
  FaCarSide,
  FaShieldAlt,
  FaUsers,
  FaClock,
} from "react-icons/fa";

export default function About() {
  return (
    <section className="about-wrapper" id="about">

      {/* LEFT CONTENT */}
      <div className="about-left">
        <h2 className="about-heading">
          About Tirumala Motor <br /> Driving School
        </h2>

        <p className="about-desc">
          With 15+ years of excellence, we help learners become confident,
          responsible, and skilled drivers. Our training combines structured
          lessons, modern vehicles, and certified instructors for the best
          learning experience.
        </p>

        <div className="about-cards">
          <div className="about-card">
            <FaBullseye className="about-icon" size={40} />
            <h3>Our Mission</h3>
            <p>
              Empowering every student with high-quality driving education.
            </p>
          </div>

          <div className="about-card">
            <FaEye className="about-icon" size={40} />
            <h3>Our Vision</h3>
            <p>
              To be the most innovative and trusted driving school.
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT STATS */}
      <div className="about-stats">
        <div className="stat-box">
          <FaStar />
          <h4>15+ Years</h4>
          <p>Experience</p>
        </div>

        <div className="stat-box">
          <FaCarSide />
          <h4>5000+</h4>
          <p>Drivers Trained</p>
        </div>

        <div className="stat-box">
          <FaShieldAlt />
          <h4>Top Safety</h4>
          <p>Certified</p>
        </div>

        <div className="stat-box">
          <FaUsers />
          <h4>Expert Team</h4>
          <p>Certified Staff</p>
        </div>

        <div className="stat-box">
          <FaClock />
          <h4>Flexible</h4>
          <p>Timings</p>
        </div>

        <div className="stat-box">
          <FaBullseye />
          <h4>High Success</h4>
          <p>98% Passed</p>
        </div>
      </div>

    </section>
  );
}
