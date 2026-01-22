"use client";

import Link from "next/link";
import "./Header.css";
import { useState } from "react";
import CategoryModal from "./CategoryModal";
import BootstrapClient from "../BootstrapClient";
export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="navbar navbar-expand-lg bg-body-tertiary custom-navbar">
        <div className="container-fluid">

          <Link className="navbar-brand fw-bold" href="/">
            Tirumala Motor Driving School
          </Link>

          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarSupportedContent"
            aria-controls="navbarSupportedContent"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          <div className="collapse navbar-collapse" id="navbarSupportedContent">
            <ul className="navbar-nav ms-auto mb-lg-0">

              <li className="nav-item">
                <Link className="nav-link" href="#home">Home</Link>
              </li>

              <li className="nav-item dropdown">
                <a
                  className="nav-link dropdown-toggle"
                  href="#"
                  role="button"
                  data-bs-toggle="dropdown"
                >
                  Services
                </a>

                <ul className="dropdown-menu">
                  <li>
                    <Link className="dropdown-item" href="#courses">
                      Bike Training
                    </Link>
                  </li>
                  <li>
                    <Link className="dropdown-item" href="#courses">
                      Car Training
                    </Link>
                  </li>
                </ul>
              </li>

              <li className="nav-item">
                <Link className="nav-link" href="#whyus">Why Us</Link>
              </li>

              <li className="nav-item">
                <Link className="nav-link" href="#about">About</Link>
              </li>

              <li className="nav-item">
                <Link className="nav-link" href="#contact">Contact</Link>
              </li>

              <li className="nav-item">
                <Link className="nav-link login-btn" href="/login">
                  Log In
                </Link>
              </li>

              {/* ✅ MODAL TRIGGER */}
              <li className="nav-item">
                <button
                  className="nav-link login-btn btn-link"
                  onClick={() => setOpen(true)}
                  type="button"
                >
                  Set up my business
                </button>
              </li>

            </ul>
          </div>
        </div>
      </nav>

      {/* ✅ MODAL OUTSIDE NAVBAR */}
      {open && <CategoryModal onClose={() => setOpen(false)} />}
    </>
  );
}