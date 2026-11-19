"use client";
import { useState } from "react";
import "./Login.css";
import { useVendor } from "../context/VendorContext";

export default function Login({ onClose }) {
  console.log("LOGIN MODAL RENDERED");

const { vendorInfo } = useVendor();

const vendorName = vendorInfo?.businessName || vendorInfo?.vendor?.businessName;


  const [mobile, setMobile] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [otp, setOtp] = useState("");
  const [otpAttemptToken, setOtpAttemptToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  // -----------------------------
  // SEND OTP (CUSTOMER)
  // -----------------------------
  const sendOtp = async () => {
    if (mobile.length !== 10) {
      alert("Enter a valid 10-digit mobile number");
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/customers/request-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            countryCode,
            phone: mobile,
            vendorId,
            categoryId,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.message === "OTP sent") {
        setOtpAttemptToken(data?.otpAttemptToken || "");
        setOtpSent(true);
      } else {
        alert(data.message || "OTP sending failed");
      }
    } catch {
      alert("Network Error");
    }
  };

  // -----------------------------
  // VERIFY OTP (CUSTOMER)
  // -----------------------------
  const verifyOtp = async () => {
    if (!otp) {
      alert("Enter OTP");
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/customers/verify-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            countryCode,
            phone: mobile,
            otp,
            vendorId,
            categoryId,
            otpAttemptToken,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.message === "OTP verified" || data.message === "verified")) {
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("loginTime", String(Date.now()));

        localStorage.setItem(
          "userData",
          JSON.stringify({
            name:
              data?.customer?.name ||
              `${data?.customer?.firstName || ""} ${data?.customer?.lastName || ""}`.trim() ||
              "Customer",
            phone: data?.customer?.phone || data?.customer?.fullNumber || mobile,
          })
        );

        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new Event("auth-changed"));
        onClose();
      } else {
        alert(data.message || "Invalid OTP");
      }
    } catch {
      alert("Network Error");
    }
  };

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="login-overlay">
  <div className="login-modal">

    {/* ======================
       CUSTOMER LOGIN
    ====================== */}
    {!otpSent && (
      <>
        <h4 className="login-sub">Log in</h4>

        <h2 className="login-title">
          Welcome to {vendorName || "Our Services"}
        </h2>

        <p className="login-desc">
          Explore our services with a quick login.
        </p>

        <label className="login-label">Mobile number</label>

        <div className="mobile-input">
          <select
            className="country-code"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
          >
            <option value="+91">🇮🇳 +91</option>
          </select>

          <input
            type="tel"
            maxLength={10}
            value={mobile}
            onChange={(e) =>
              setMobile(e.target.value.replace(/\D/g, ""))
            }
            placeholder="Mobile number"
          />
        </div>

        <button className="continue-btn" onClick={sendOtp}>
          Continue
        </button>

        <button className="cancel-btn" onClick={onClose}>
          Cancel
        </button>
      </>
    )}

    {/* ======================
       OTP SCREEN
    ====================== */}
    {otpSent && (
      <>
        <input
          className="otp-input"
          type="number"
          placeholder="Enter OTP"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
        />

        <button className="continue-btn" onClick={verifyOtp}>
          Verify & Continue
        </button>
      </>
    )}

  </div>
</div>

  );
}
