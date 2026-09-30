FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
FROM node:22-alpine
WORKDIR /app
RUN addgroup -S mathable && adduser -S mathable -G mathable
COPY --from=build /app /app
USER mathable
EXPOSE 3000
CMD ["node","server/src/index.js"]
