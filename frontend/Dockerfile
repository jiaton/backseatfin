FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run check:api && npm run lint && npm run test && npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
# The stock image's entrypoint fills ${EMBY_URL} into templates/*.template → conf.d/.
COPY templates /etc/nginx/templates
RUN rm -f /etc/nginx/conf.d/default.conf

# 80: the admin site. 8080: the car host (Emby + the car player).
EXPOSE 80 8080
