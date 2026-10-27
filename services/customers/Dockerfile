FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/catalog/package.json services/catalog/package.json
COPY services/customers/package.json services/customers/package.json
COPY services/orders/package.json services/orders/package.json
COPY services/notifications/package.json services/notifications/package.json
RUN npm ci

COPY packages/common/ packages/common/
COPY services/customers/ services/customers/
RUN npm run build -w @shop/common \
    && npm run build -w @shop/customers \
    && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/common/ packages/common/
COPY --from=build /app/services/customers/ services/customers/
USER node
EXPOSE 3000
CMD ["node", "services/customers/dist/server.js"]
