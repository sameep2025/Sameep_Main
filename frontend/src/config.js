// src/config.js
const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : "http://sameep-20-env.eba-ghup7zhc.ap-south-1.elasticbeanstalk.com/";

export default API_BASE_URL;
