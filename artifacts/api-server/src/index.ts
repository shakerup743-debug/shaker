import { createServer } from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { socketBroker } from "./lib/socket-broker.js";
import { startAvailabilityScheduler } from "./lib/availability-scheduler.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);

socketBroker.attach(server);

server.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");
  startAvailabilityScheduler();
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
