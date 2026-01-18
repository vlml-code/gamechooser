# gamechooser

Minimal Node.js service intended for Azure Web Apps deployment.

## Run locally

```bash
npm install
npm start
```

The service listens on `http://localhost:3000/` by default. You can set `PORT` to override the port.

## Endpoint

* `GET /` returns a JSON status payload.
