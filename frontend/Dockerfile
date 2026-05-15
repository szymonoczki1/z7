# stage1 -> skopiuj pliki statyczne (builder)
FROM node:20-alpine AS builder
WORKDIR /app
COPY index.html products.html stats.html style.css app.js ./

# stage2 -> produkcja
FROM nginx:alpine
ARG NGINX_VERSION
LABEL version=$NGINX_VERSION
COPY --from=builder /app /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
