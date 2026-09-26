import "dotenv/config";

// Integration tests write real rows, so they only ever run against the Neon "test" branch.
const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) throw new Error("DATABASE_URL_TEST is not set; refusing to run integration tests.");
if (testUrl === process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL_TEST equals DATABASE_URL; refusing to run tests against the app database.");
}
process.env.DATABASE_URL = testUrl;

// Uploads go to the test branch's own object storage, never the app's.
const storageTest = process.env.S3_ENDPOINT_TEST;
if (!storageTest) throw new Error("S3_ENDPOINT_TEST is not set; refusing to run integration tests.");
if (storageTest === process.env.S3_ENDPOINT) throw new Error("S3_ENDPOINT_TEST equals S3_ENDPOINT; refusing.");
process.env.S3_ENDPOINT = storageTest;

// Phase 16: never let tests read the app's replica or share the app's Redis.
process.env.DATABASE_URL_READ = process.env.DATABASE_URL_READ_TEST ?? "";
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? "";
