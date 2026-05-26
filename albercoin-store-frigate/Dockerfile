FROM node:22-bookworm-slim

WORKDIR /opt/umbrel-frigate

COPY app ./app
COPY web ./web

CMD ["node", "app/server.js"]
