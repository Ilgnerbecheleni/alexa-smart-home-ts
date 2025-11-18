FROM node:20-alpine

# Diretório de trabalho dentro do container
WORKDIR /usr/src/app

# Copia manifestos
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia o restante do código
COPY . .

# Gera client do Prisma
RUN npx prisma generate

# Build (assumindo que você tem script "build" no package.json)
RUN npm run build

# Expor porta da API
EXPOSE 3000

# Ao subir o container:
# 1) aplica migrations
# 2) inicia o servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
