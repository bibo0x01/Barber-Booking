# Barber-Booking

## Socket.IO queue testing

The API exposes a Socket.IO server on the same HTTP server used by the REST API.

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: USER_TOKEN,
  },
});

socket.emit('queue:join', { barberId: BARBER_ID });

socket.on('queue:join:success', (payload) => {
  console.log(payload);
});

socket.on('queue:updated', (payload) => {
  console.log(payload);
});

socket.on('queue:error', (payload) => {
  console.log(payload.message);
});

socket.emit('queue:leave', { barberId: BARBER_ID });
```

Authentication is required for every Socket.IO connection. A missing, invalid, or expired JWT will reject the connection with a Socket.IO error. Queue updates are only broadcast after the related database transaction succeeds.
