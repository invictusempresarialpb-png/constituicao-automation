FROM mcr.microsoft.com/playwright:v1.59.1-focal

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001

CMD ["npm", "start"]
