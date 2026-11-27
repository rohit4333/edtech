FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev

COPY server ./server
COPY index.html apps.html login.html register.html password-reset.html pricing.html terms.html privacy.html refund.html contact.html public.css landing.css landing.js sw.js ./
COPY assets ./assets
COPY classroom ./classroom
COPY founder ./founder
COPY founder-admin ./founder-admin
COPY home ./home
COPY login ./login
COPY lms ./lms
COPY parent ./parent
COPY planner-agent ./planner-agent
COPY register ./register
COPY rm ./rm
COPY shared ./shared
COPY student ./student
COPY trainer ./trainer
COPY unified ./unified
COPY webapp ./webapp

ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/index.js"]
