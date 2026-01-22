"use client";

import Image from "next/image";
import "./Home.css";
// import useVendorData from "../Api/useVendorData"; // keep if needed later

export default function Home() {
  return (
    <div id="home">
      <div className="hero-container">

        <div className="hero-left">
          <h1 className="fly-in-text delay-text">
            Confidence Behind the Wheel Begins with Expert Training
          </h1>

          <p className="hero-desc fly-in-text delay-para">
            Whether you're a beginner or an advanced learner, our personalized
            driving courses are designed to build confidence, sharpen skills,
            and get you fully road-ready.
          </p>

          <div className="hero-stats fly-in-text delay-stats">
            <div>
              <h2>15+</h2>
              <p>Years Experience</p>
            </div>
            <div>
              <h2>1000+</h2>
              <p>Happy Customers</p>
            </div>
            <div>
              <h2>Top-Rated</h2>
              <p>Quality Service</p>
            </div>
          </div>

          <div className="hero-buttons fly-in-text delay-buttons">
            <button className="btn-explore">🚗 Explore Courses</button>
            <button className="btn-quote">📞 Get a Quote</button>
          </div>
        </div>

        <div className="hero-right fade-in-img">
          <div className="image-card">
            <Image
              src="/carImg.jpg"
              alt="Driving School Car"
              width={520}
              height={380}
              priority
            />
          </div>
        </div>

      </div>
    </div>
  );
}
