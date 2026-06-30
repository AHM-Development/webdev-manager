# Debian (glibc) rather than alpine: Next 16's Turbopack needs the native
# @next/swc binary, and the linux-arm64-gnu variant requires glibc to load.
FROM node:20-slim

WORKDIR /app

# Install deps first for better layer caching.
# npm install (not ci) so the correct platform-native @next/swc binary is
# resolved for the build arch — the host lockfile may lack the Linux musl variant.
COPY package*.json ./
RUN npm install

# App source + production build
COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
