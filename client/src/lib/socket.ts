import { io, type Socket } from 'socket.io-client'
import { API_URL, assertApiBaseConfigured } from './config'

let socket: Socket | null = null

export function getSocket(): Socket {
  assertApiBaseConfigured()
  if (!socket) {
    socket = io(API_URL, {
      path: '/socket.io',
      // WebSocket en priorité ; polling si réseau / proxy bloque le WS.
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
      timeout: 20000,
    })
  }
  return socket
}

