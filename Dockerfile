FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY public ./public
ENV NODE_ENV=production
ENV PORT=5186
ENV DATA_DIR=/app/data
EXPOSE 5186
CMD ["node", "server.mjs"]
