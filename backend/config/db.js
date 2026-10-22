const mongoose = require('mongoose');

function getSafeMongoTarget(uri, dbName) {
  try {
    const parsed = new URL(uri);
    return {
      database: String(dbName || ""),
      host: parsed.hostname || "unavailable",
      protocol: parsed.protocol.replace(":", ""),
    };
  } catch {
    return {
      database: String(dbName || ""),
      host: "unavailable",
      protocol: "mongodb",
    };
  }
}

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/categoryApp";
    const dbName = process.env.MONGODB_DBNAME || "categoryApp";

    if (!process.env.MONGODB_URI) {
      console.warn("MONGODB_URI not set. Using the local MongoDB fallback.");
    }

    console.log("Connecting to MongoDB:", getSafeMongoTarget(uri, dbName));
    await mongoose.connect(uri, { dbName });
    console.log("MongoDB connected");
    console.log("Current DB:", mongoose.connection.db.databaseName);
    console.log("Host:", mongoose.connection.host);
  } catch (err) {
    console.error("MongoDB connection failed", {
      name: String(err?.name || "MongoError"),
      code: err?.code === undefined ? undefined : String(err.code),
    });
  }
};

module.exports = connectDB;
module.exports.getSafeMongoTarget = getSafeMongoTarget;
