FROM node:18-alpine

# Устанавливаем build tools, canvas зависимости И нужные шрифты
RUN apk add --no-cache \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    font-noto \
    font-noto-emoji

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production && npm cache clean --force

COPY . ./

# Обновляем кэш шрифтов
RUN fc-cache -fv

RUN addgroup -g 1001 -S nodejs && \
    adduser -S carousel -u 1001 -G nodejs && \
    chown -R carousel:nodejs /app

USER carousel

ENV NODE_ENV=production PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "server.js"]
