FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Use non-root user for security
USER node

EXPOSE 5000
CMD ["npm", "start"]
