import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { getCurrentMetrics } from '../lib/metricsTracker.js';
import { prisma } from '../lib/prisma.js';

let io: SocketIOServer | null = null;
let metricsTicker: any = null;

export function initWebSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', async (socket: Socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    // Send initial snapshot on connect
    try {
      const metrics = await getCurrentMetrics();
      socket.emit('metrics:tick', metrics);

      const recentIncidents = await prisma.incident.findMany({
        take: 10,
        orderBy: { lastSeen: 'desc' }
      });
      socket.emit('incidents:initial', recentIncidents);
    } catch (err: any) {
      console.warn('[WebSocket Init Warning]', err.message);
    }

    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });
  });

  // Start 3-second live metrics broadcast
  if (!metricsTicker) {
    metricsTicker = setInterval(async () => {
      if (io && io.engine.clientsCount > 0) {
        try {
          const metrics = await getCurrentMetrics();
          io.emit('metrics:tick', metrics);
        } catch {}
      }
    }, 3000);
  }

  return io;
}

export function broadcastEvent(event: any): void {
  if (io) {
    io.emit('event:new', event);
  }
}

export function broadcastIncidentUpdate(incident: any, isNew: boolean = false): void {
  if (io) {
    io.emit('incident:update', { incident, isNew });
  }
}

export function broadcastMetrics(): void {
  if (io) {
    getCurrentMetrics().then(m => io?.emit('metrics:tick', m)).catch(() => {});
  }
}

export function getIO(): SocketIOServer | null {
  return io;
}
