const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/categoryApp";
    const dbName = process.env.MONGODB_DBNAME || "categoryApp";

    if (!process.env.MONGODB_URI) {
      console.warn("⚠️  MONGODB_URI not set. Using local fallback:", uri);
    }

    console.log("👉 Connecting to:", uri);
    await mongoose.connect(uri, { dbName });
    console.log("✅ MongoDB connected");
    console.log("📂 Current DB:", mongoose.connection.db.databaseName);
    console.log("🧭 Host:", mongoose.connection.host);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
  }
};

module.exports = connectDB;
