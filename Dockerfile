FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app

# Copia package.json primeiro para cache otimizado
COPY package*.json ./

# Instala dependências
RUN npm install --production

# Copia código fonte
COPY . .

# Expõe porta 3001
EXPOSE 3001

# Comando para iniciar aplicação
CMD ["npm", "start"]
