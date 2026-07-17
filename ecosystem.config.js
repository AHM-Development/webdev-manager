// PM2 process definitions for the AHM Web Manager monorepo (API + web).
// Run from the repo root AFTER installing deps and building the web app
// (see DEPLOY.md):
//
//   pm2 start ecosystem.config.js
//   pm2 save        # remember the process list
//   pm2 startup     # re-launch on server reboot (run the command it prints)
//
// Both processes bind to 127.0.0.1 only; the web server reverse-proxies to them.
//
// Every path is resolved from THIS file's location, so it works at any clone
// path and no matter which directory `pm2 start` was invoked from. (A relative
// `cwd` is resolved against the PM2 daemon's cwd, not this file — which silently
// launches the apps from the wrong directory.)

const path = require("path");

const API_DIR = path.join(__dirname, "api");
const WEB_DIR = path.join(__dirname, "web");

module.exports = {
  apps: [
    {
      name: "ahm-api",
      cwd: API_DIR,
      script: path.join(API_DIR, "bin", "www"),
      interpreter: "node",
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
      cwd: WEB_DIR,
      // Run Next's binary directly rather than `npm start`: npm resolves
      // package.json from its own cwd and needs to be on PM2's PATH (a problem
      // under nvm). This is equivalent to `next start` inside web/.
      script: path.join(WEB_DIR, "node_modules", "next", "dist", "bin", "next"),
      args: "start",
      interpreter: "node",
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
