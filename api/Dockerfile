FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json ./
RUN npm ci

# App source
COPY . .

# Container listens on PORT from api/.env.
EXPOSE 5001

CMD ["npm", "start"]
