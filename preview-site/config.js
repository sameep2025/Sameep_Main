// preview-site/config.js
const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : "https://Sameep-V3.ap-south-1.elasticbeanstalk.com";

export default API_BASE_URL;
