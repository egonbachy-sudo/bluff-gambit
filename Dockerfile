FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
# The SQLite file lives on a persistent volume mounted at /data.
ENV DB_PATH=/data/bluff.db PORT=8080
EXPOSE 8080
CMD ["node", "server/index.ts", "--prod"]
