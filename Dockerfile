FROM node:18-alpine

WORKDIR /app

# Copiamos dependencias primero
COPY package*.json ./

# Instalamos dependencias
RUN npm install --omit=dev

# Copiamos el resto del proyecto
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
