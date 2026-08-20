import { createApp } from "./app.js";
import { config } from "./config.js";

createApp().listen(config.port, () => {
  console.log(`
  StrideUp Finance running on http://localhost:${config.port}
  Environment: ${config.isProd ? "production" : "development"}
  Database: ${config.hasDatabase ? "Neon Postgres" : "embedded Postgres (pglite, local dev)"}
  Reading documents: ${config.anthropic.enabled ? "on" : "off (set ANTHROPIC_API_KEY)"}
`);
});
