const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const DATABASE_PREFIX = "ynot_prepaid_it_";

function generatedDatabaseName() {
  return `${DATABASE_PREFIX}${crypto.randomBytes(8).toString("hex")}`;
}

function isLoopbackHost(host) {
  const normalized = String(host || "").split(":")[0].replace(/^\[|\]$/g, "");
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

class PrepaidMongoIntegrationHarness {
  constructor() {
    this.databaseName = generatedDatabaseName();
    this.replSet = null;
    this.identity = null;
  }

  async start() {
    assert.equal(mongoose.connection.readyState, 0, "Mongoose must be disconnected before integration startup");

    this.replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    const uri = this.replSet.getUri(this.databaseName);
    assert.ok(uri.startsWith("mongodb://127.0.0.1:"), "Ephemeral MongoDB must bind to loopback");
    assert.ok(uri.includes(`/${this.databaseName}?`), "Generated database must be present in the ephemeral URI");

    await mongoose.connect(uri, {
      dbName: this.databaseName,
      autoIndex: false,
      serverSelectionTimeoutMS: 10_000,
    });

    this.identity = await this.verifyIdentity();
    await this.verifyTransactions();
    return this.identity;
  }

  async verifyIdentity() {
    assert.match(this.databaseName, /^ynot_prepaid_it_[a-f0-9]{16}$/);
    assert.equal(mongoose.connection.name, this.databaseName);
    assert.equal(mongoose.connection.readyState, 1);

    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    const buildInfo = await mongoose.connection.db.admin().command({ buildInfo: 1 });
    assert.ok(hello.setName, "MongoDB must report replica-set topology");
    assert.equal(hello.isWritablePrimary, true, "Ephemeral replica-set node must be primary");
    assert.ok(Array.isArray(hello.hosts) && hello.hosts.length === 1);
    assert.ok(hello.hosts.every(isLoopbackHost), "Replica-set members must be loopback hosts");

    return {
      databaseName: this.databaseName,
      mongoVersion: buildInfo.version,
      replicaSetName: hello.setName,
      memberCount: hello.hosts.length,
      topology: "ReplicaSetWithPrimary",
    };
  }

  assertSafeDatabase() {
    assert.ok(this.identity, "Ephemeral database identity must be verified first");
    assert.match(this.databaseName, /^ynot_prepaid_it_[a-f0-9]{16}$/);
    assert.equal(mongoose.connection.name, this.databaseName);
    assert.equal(mongoose.connection.readyState, 1);
  }

  async verifyTransactions() {
    this.assertSafeDatabase();
    const collection = mongoose.connection.db.collection("_integration_transaction_smoke");
    const committedId = new mongoose.Types.ObjectId();
    const abortedId = new mongoose.Types.ObjectId();

    const commitSession = await mongoose.startSession();
    try {
      await commitSession.withTransaction(async () => {
        await collection.insertOne({ _id: committedId, outcome: "committed" }, { session: commitSession });
      });
    } finally {
      await commitSession.endSession();
    }

    const abortSession = await mongoose.startSession();
    try {
      abortSession.startTransaction();
      await collection.insertOne({ _id: abortedId, outcome: "aborted" }, { session: abortSession });
      await abortSession.abortTransaction();
    } finally {
      await abortSession.endSession();
    }

    assert.equal(await collection.countDocuments({ _id: committedId }), 1);
    assert.equal(await collection.countDocuments({ _id: abortedId }), 0);
  }

  async createSchemaIndexes(models) {
    this.assertSafeDatabase();
    for (const Model of models) {
      await Model.createCollection();
      await Model.createIndexes();
    }
  }

  async clearData() {
    this.assertSafeDatabase();
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      if (!collection.collectionName.startsWith("system.")) {
        await collection.deleteMany({});
      }
    }
  }

  async stop() {
    if (mongoose.connection.readyState !== 0) {
      if (this.identity) {
        this.assertSafeDatabase();
        await mongoose.connection.dropDatabase();
      }
      await mongoose.disconnect();
    }
    if (this.replSet) await this.replSet.stop();
    this.replSet = null;
    this.identity = null;
  }
}

module.exports = {
  DATABASE_PREFIX,
  PrepaidMongoIntegrationHarness,
};
