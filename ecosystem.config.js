// PM2 process definitions for the AHM Web Manager monorepo (API + web).
// Run from the repo root AFTER installing deps and building the web app
// (see DEPLOY.md):
//
//   pm2 start ecosystem.config.js
//   pm2 save        # remember the process list
//   pm2 startup     # re-launch on server reboot (run the command it prints)
//
// Both processes bind to 127.0.0.1 only; nginx reverse-proxies to them.
module.exports = {
  apps: [
    {
      name: "ahm-api",
      cwd: "./api",
      script: "./bin/www",
      exec_mode: "fork",
      instances: 1,
      max_restarts: 10,
      restart_delay: 3000,
      // DB, Redis, JWT, SMTP, Viktor, etc. are read from api/.env by dotenv.
      // Only the two host-level values are set here.
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
    },
    {
      name: "ahm-web",
      cwd: "./web",
      // `next start` — the build must already exist (npm run build).
      script: "npm",
      args: "start",
      exec_mode: "fork",
      instances: 1,
      max_restarts: 10,
      restart_delay: 3000,
      // NEXT_PUBLIC_API_URL is baked in at build time (web/.env.production),
      // not here. Only the runtime port is set.
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
