import axios from "axios";

// Set your backend URL based on environment
const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : "http://sameep-20-env.eba-ghup7zhc.ap-south-1.elasticbeanstalk.com/";

const API = axios.create({
  baseURL: API_BASE_URL,
});

export default API;
