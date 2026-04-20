FROM mcr.microsoft.com/playwright:v1.59.1-focal

WORKDIR /app

# Copia package.json primeiro para cache otimizado
COPY package*.json ./

# Instala dependências
RUN npm install --omit=dev

# Copia código fonte
COPY . .

# Expõe porta 3001
EXPOSE 3001

# Comando para iniciar aplicação
CMD ["npm", "start"]
