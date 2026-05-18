import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware.js";
import router from "./routes/index.js";
import { stripeWebhookHandler } from "./routes/billing.js";
import { logger } from "./lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openApiSpec = yaml.load(
  readFileSync(resolve(__dirname, "../../../lib/api-spec/openapi.yaml"), "utf-8"),
) as Record<string, unknown>;

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Stripe webhook: must use raw body BEFORE express.json() parses the stream.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => void stripeWebhookHandler(req, res),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const clerkKey = process.env.CLERK_PUBLISHABLE_KEY ?? "";
const isClerkConfigured =
  (clerkKey.startsWith("pk_test_") || clerkKey.startsWith("pk_live_")) &&
  clerkKey.length > 25 &&
  !clerkKey.includes("placeholder");

if (isClerkConfigured) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else {
  logger.warn(
    "Clerk middleware DISABLED (no valid CLERK_PUBLISHABLE_KEY). JWT auth via /api/auth/login is still available.",
  );
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customSiteTitle: "FOODORO API Docs",
  swaggerOptions: { persistAuthorization: true },
}));
app.use("/api", router);

export default app;
