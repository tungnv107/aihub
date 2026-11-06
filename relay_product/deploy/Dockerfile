FROM node:24.22.1-bookworm-slim
WORKDIR /app
COPY relay_product/ ./relay_product/
COPY release.signed.json ./
ENV RELAY_DB=/data/relay.sqlite
USER node
CMD ["node","relay_product/proxy-server.mjs"]
