\
# Alternative to render.yaml — builds the JamQuote API as a standalone image.
# Build from the REPO ROOT (needs the whole workspace for turbo/npm workspaces):
#   docker build -f apps/api/Dockerfile -t jamquote-api .
#   docker run -p 3001:3001 --env-file apps/api/.env jamquote-api
FROM node:20-slim AS base
WORKDIR /repo

# Install dependencies for the whole workspace (turbo needs the full repo
# graph to resolve @jamquote/core -> @jamquote/api).
COPY . .
RUN npm ci

# @prisma/client's generated types/runtime don't exist until `prisma generate`
# runs, and @jamquote/api's runtime import of @jamquote/core needs core's
# dist/ built first — turbo's ^build dependency handles the latter.
RUN npm run -w @jamquote/api prisma:generate
RUN npx turbo run build --filter=@jamquote/api

EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
