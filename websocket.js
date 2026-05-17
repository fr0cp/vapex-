import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { getJwtSecret } from '../config/env.js';
import { getProductionCorsOrigins } from '../config/cors.js';
import { Device } from '../models/Device.js';
import { Puff } from '../models/Puff.js';

let io = null;
const connectedClients = new Map(); // userId -> socket[]

export const setupWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? getProductionCorsOrigins()
        : '*',
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    // Authenticate socket
    socket.on('authenticate', async (token) => {
      try {
        const decoded = jwt.verify(token, getJwtSecret());
        socket.userId = decoded.userId;

        if (!connectedClients.has(decoded.userId)) {
          connectedClients.set(decoded.userId, []);
        }
        connectedClients.get(decoded.userId).push(socket);

        socket.join(`user_${decoded.userId}`);
        socket.emit('authenticated', { success: true });

        logger.info({ userId: decoded.userId, socketId: socket.id }, 'Socket authenticated');
      } catch (error) {
        socket.emit('authenticated', { success: false, error: 'Invalid token' });
      }
    });

    // Device real-time data
    socket.on('device:telemetry', async (data) => {
      if (!socket.userId) return;

      try {
        const { deviceId, battery, temperature, puffs } = data || {};

        if (!deviceId) return;

        const device = await Device.findOneAndUpdate(
          { _id: deviceId, userId: socket.userId },
          {
            batteryLevel: battery,
            lastSeen: new Date()
          },
          { new: true }
        );

        if (!device) return;

        // Broadcast to user's other clients
        socket.to(`user_${socket.userId}`).emit('device:update', {
          deviceId,
          battery,
          temperature,
          puffs,
          timestamp: new Date().toISOString()
        });

        logger.debug({ deviceId, battery }, 'Device telemetry received');
      } catch (error) {
        logger.error({ error }, 'Failed to process device telemetry');
      }
    });

    // Puff event from device
    socket.on('puff:recorded', async (data) => {
      if (!socket.userId) return;

      try {
        const { deviceId, duration, power, temperature } = data || {};
        if (!deviceId) return;

        const owned = await Device.exists({ _id: deviceId, userId: socket.userId });
        if (!owned) return;

        const puff = await Puff.create({
          userId: socket.userId,
          deviceId,
          duration: duration ?? 2,
          power: power ?? 20,
          temperature: temperature ?? 200,
          nicotineConsumed: 0,
          liquidConsumed: 0.03,
          timestamp: new Date()
        });

        const dailyStats = await Puff.getDailyStats(socket.userId);

        // Broadcast to all user's clients
        io.to(`user_${socket.userId}`).emit('puff:new', {
          puffId: puff._id,
          deviceId: data.deviceId,
          timestamp: puff.timestamp,
          stats: {
            dailyTotal: dailyStats.totalPuffs,
            totalNicotine: dailyStats.totalNicotine,
            totalLiquid: dailyStats.totalLiquid
          }
        });

        logger.info({ userId: socket.userId, puffId: puff._id }, 'Puff recorded via WebSocket');
      } catch (error) {
        logger.error({ error }, 'Failed to record puff via WebSocket');
      }
    });

    // Find my vape - ring device (must own device)
    socket.on('device:ring', async (data) => {
      if (!socket.userId) return;

      const { deviceId } = data || {};
      if (!deviceId) return;

      const owned = await Device.exists({ _id: deviceId, userId: socket.userId });
      if (!owned) {
        socket.emit('device:ringing', { deviceId, status: 'denied', error: 'Not authorized' });
        return;
      }

      // Notify device room if a device client is connected
      io.to(`device_${deviceId}`).emit('device:ring_command', {
        duration: 5000,
        pattern: 'sos'
      });

      socket.emit('device:ringing', { deviceId, status: 'ringing' });

      logger.info({ userId: socket.userId, deviceId }, 'Ring device command sent');
    });

    // Disconnect
    socket.on('disconnect', () => {
      if (socket.userId && connectedClients.has(socket.userId)) {
        const sockets = connectedClients.get(socket.userId);
        const index = sockets.indexOf(socket);
        if (index > -1) sockets.splice(index, 1);
        if (sockets.length === 0) connectedClients.delete(socket.userId);
      }
      logger.info({ socketId: socket.id }, 'Client disconnected');
    });
  });

  return io;
};

// Utility to broadcast to specific user
export const broadcastToUser = (userId, event, data) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
};

// Utility to broadcast to all
export const broadcastAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

export { io };
