FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev

COPY server ./server
COPY index.html apps.html pricing.html terms.html privacy.html refund.html contact.html public.css ./
COPY assets ./assets
COPY classroom ./classroom
COPY home ./home
COPY lms ./lms
COPY shared ./shared
COPY student ./student
COPY trainer ./trainer

ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/index.js"]
