"use client";

import { useState, useEffect } from "react";

 import Explore from "./Explore/Explore";
 import Homepage from "./Homepage/Home";
 import Header from "./Header/Header";
 import Why from './Why/Why';
 import Contact from './Contact/Contact';
 import Enroll from './Enroll/Enroll';
// import Combo from "./Combo/Combo";
// import Root from "./Root/RootSection";
 import About from "./About/About";

 import Footer from "./Footer/Footer";
 import Load from "./Load/Load";
// import Portal from './Portal/Portal';
export default function Home() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      {loading ? (
        <Load />
      ) : (
        <>
          <Header />
          <Homepage />
          <Explore/>
          <Why/>
          <About />
          <Contact/>
           <Footer />
          {/* <Enroll/> */}
          {/* <Combo />
          <Explore />
          <Root />
          
          <Contact />
         
         <Portal/> */}
        </>
      )}
    </div>
  );
}
