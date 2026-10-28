import { syncOne, cleanIntegrationFiles } from "../lib/integrations/sync";
// Run as a supervised process for continuous synchronization, or --once from cron.
const once = process.argv.includes("--once");
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
do {
  try {
    await cleanIntegrationFiles();
    const worked = await syncOne();
    if (!worked && !once && !stopping) await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch { console.error("Integration worker failed. Check database migrations and server configuration."); if (once) process.exitCode = 1; else await new Promise((resolve) => setTimeout(resolve, 10000)); }
} while (!once && !stopping);
