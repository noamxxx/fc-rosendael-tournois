import { io, type Socket } from 'socket.io-client'
import { API_URL, assertApiBaseConfigured } from './config'

let socket: Socket | null = null

export function getSocket(): Socket {
  assertApiBaseConfigured()
  if (!socket) {
    socket = io(API_URL, {
      // Allow fallback to polling (some networks/dev setups block WS).
      transports: ['websocket', 'polling'],
    })
  }
  return socket
}

