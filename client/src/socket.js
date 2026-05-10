import { io } from 'socket.io-client';
// Connect to current host so Vite's proxy forwards to the server on any device
export default io({ reconnectionDelay: 1000 });
