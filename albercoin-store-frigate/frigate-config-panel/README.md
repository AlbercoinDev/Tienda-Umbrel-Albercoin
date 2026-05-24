# Frigate Umbrel Config Panel

Ficheros:

- `docker-compose.yml`: sustituye al actual.
- `web/Dockerfile`: imagen mínima del panel.
- `web/app.py`: panel web sin dependencias externas.

Uso:

1. Copia estos ficheros en la carpeta de la app `semillabitcoin-frigate`.
2. En desarrollo puedes usar `build: ./web`.
3. Para publicar en Umbrel App Store, construye y sube la imagen del panel y cambia:

```yaml
web:
  build: ./web
```

por:

```yaml
web:
  image: tu-registry/frigate-umbrel-config-panel:1.5.2-6
```

El panel genera `/data/frigate-home/config.toml` y reinicia solo el contenedor `semillabitcoin-frigate_server_1` usando Docker socket.

Seguridad: montar `/var/run/docker.sock` da control del host al contenedor `web`. Úsalo solo si el panel queda detrás del proxy local de Umbrel y sin exposición pública.
