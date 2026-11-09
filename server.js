const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && (!process.env.APP_SESSION_SECRET || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)) {
  throw new Error("Production requires APP_SESSION_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD.");
}
if (isProduction && process.env.ADMIN_PASSWORD.length < 16) {
  throw new Error("Production ADMIN_PASSWORD must be at least 16 characters.");
}

const { database, SqliteSessionStore } = require("./src/db");
const { originCheck } = require("./src/middleware");

const app = express();

app.get("/healthz", (_req, res) => {
  const result = database.pragma("quick_check", { simple: true });
  if (result !== "ok") return res.status(503).json({ status: "unhealthy" });
  res.json({ status: "ok" });
});

// Production deployments normally terminate HTTPS at one hosting proxy.
const trustedProxyHops = process.env.TRUST_PROXY
  ? Number(process.env.TRUST_PROXY)
  : isProduction ? 1 : 0;
if (process.env.TRUST_PROXY || isProduction) {
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 1) {
    throw new Error("TRUST_PROXY must be a positive integer hop count.");
  }
  app.set("trust proxy", trustedProxyHops);
}

const sessionSecret = process.env.APP_SESSION_SECRET || crypto.randomBytes(48).toString("hex");

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
const defaultJsonParser = express.json({ limit: "64kb" });
const campaignJsonParser = express.json({ limit: "11mb" });
app.use((req, res, next) => {
  const parser = req.method === "POST" && req.path === "/api/campaigns"
    ? campaignJsonParser
    : defaultJsonParser;
  parser(req, res, next);
});
app.use(originCheck);
app.use(session({
  name: "rcs.sid",
  store: new SqliteSessionStore(),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(require("./src/routes/auth"));
app.use(require("./src/routes/users"));
app.use(require("./src/routes/dashboard"));
app.use(require("./src/routes/campaigns"));
app.use(require("./src/routes/templates"));
app.use(require("./src/routes/bots"));
app.use(require("./src/routes/approvals"));
app.use(require("./src/routes/pricing"));
app.use(require("./src/routes/providerSettings"));
app.use(require("./src/routes/rechargeSettings"));
app.use(require("./src/routes/apiKeys"));
app.use(require("./src/routes/messages"));
app.use(require("./src/routes/activity"));
app.use(require("./src/routes/wallet"));
app.use(require("./src/routes/tickets"));
app.use(require("./src/routes/branding"));
app.use(require("./src/routes/openapi"));

app.use(express.static(path.join(__dirname, "public"), { index: "index.html" }));
app.use((error, _req, res, _next) => {
  process.stderr.write(`${new Date().toISOString()} ${error.stack || error}\n`);
  if (res.headersSent) return;
  res.status(500).json({ error: "An internal error occurred." });
});

app.listen(port, host, () => {
  process.stdout.write(`RCS portal running at http://${host}:${port}\n`);
});
