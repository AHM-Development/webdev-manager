# AHM Web Manager API

## First production installation

1. Configure `api/.env` with production database, Redis, JWT, encryption, cookie, client URL, and Google OAuth mail values.
2. Initialize the schema:

   ```bash
   npm run db:init
   ```

3. Create the initial superadmin from an interactive terminal:

   ```bash
   npm run bootstrap:superadmin
   ```

The bootstrap command asks for an email, full name, password, and confirmation. It can only complete once and refuses to run if a superadmin already exists. Passwords must have at least 12 characters with uppercase, lowercase, number, and symbol.

All later accounts must be created through superadmin-issued invitations. Public account registration is disabled.

## Roles

- `superadmin`: system configuration, user administration, and all operational access.
- `developer`: operational create and update access.
- `spectator`: read-only operational access.
