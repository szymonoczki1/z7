FROM node:20-alpine

# ARG dostepny tylko podczas budowania obrazu
# przekazujemy przez --build-arg IMAGE_VERSION=v1
ARG IMAGE_VERSION
LABEL version=$IMAGE_VERSION

# zmienne srodowiskowe dostepne w kontenerze podczas dzialania
ENV NODE_ENV=production PORT=3000

WORKDIR /app

# najpierw kopiujemy tylko package files - osobna warstwa
# npm install zamiast npm ci - package-lock.json zmieniony przez nowe zaleznosci
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# potem reszta kodu
COPY . .

EXPOSE 3000

# uruchamiamy jako nieprivilegowany uzytkownik node (wbudowany w node:alpine)
USER node

CMD ["node", "server.js"]
