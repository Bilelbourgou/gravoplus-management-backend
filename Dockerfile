FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npm run build && npx tsc prisma/seed.ts --outDir dist/prisma --esModuleInterop --resolveJsonModule

FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma/seed.ts ./prisma/seed.ts

EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push && node dist/prisma/seed.js && npm start"]
