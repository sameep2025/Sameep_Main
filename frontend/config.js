// frontend/config.js

const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5000" // your local backend
    : "https://Sameep-V3.ap-south-1.elasticbeanstalk.com"; // your AWS backend

export default API_BASE_URL;
