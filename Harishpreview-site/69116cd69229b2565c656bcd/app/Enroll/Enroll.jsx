"use client";

import "./Enroll.css";

export default function Enroll({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-small-title">Log in</h3>

        <h2 className="modal-title">
          Welcome to Tirumala Motor Driving School
        </h2>

        <p className="modal-desc">
          Explore our services with a quick login.
        </p>

        <label className="modal-label">Mobile number</label>

        <div className="mobile-input-row">
          <select>
            <option value="+91">+91</option>
          </select>

          <input
            type="tel"
            placeholder="Mobile number"
            inputMode="numeric"
            maxLength={10}
          />
        </div>

        <button className="modal-btn">
          Continue
        </button>

        <button
          className="modal-cancel"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
