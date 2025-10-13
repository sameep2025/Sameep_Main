// import { useState, useEffect } from "react";

// export default function useGoogleMaps() {
//   const [loaded, setLoaded] = useState(false);

//   useEffect(() => {
//     const checkGoogle = () => {
//       if (window.google && window.google.maps) {
//         setLoaded(true);
//       } else {
//         setTimeout(checkGoogle, 100); // check every 100ms
//       }
//     };
//     checkGoogle();
//   }, []);

//   return loaded;
// }
