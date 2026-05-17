import mqtt from 'mqtt';
import { logger } from '../utils/logger.js';
import { Device } from '../models/Device.js';
import { Puff } from '../models/Puff.js';
import { broadcastToUser } from './websocket.js';

let mqttClient = null;

export const setupMQTT = () => {
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;

  const options = {
    clientId: `vapex_backend_${Math.random().toString(16).substring(2, 8)}`,
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 0, // disabled — no broker in dev
  };

  if (username && password) {
    options.username = username;
    options.password = password;
  }

  mqttClient = mqtt.connect(brokerUrl, options);

  mqttClient.on('connect', () => {
    logger.info('MQTT connected to broker');

    // Subscribe to device topics
    mqttClient.subscribe([
      'vapex/devices/+/telemetry',
      'vapex/devices/+/puff',
      'vapex/devices/+/status',
      'vapex/devices/+/location'
    ], (err) => {
      if (err) {
        logger.error({ err }, 'MQTT subscription failed');
      } else {
        logger.info('MQTT subscribed to device topics');
      }
    });
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      const topicParts = topic.split('/');
      const deviceSerial = topicParts[2];
      const messageType = topicParts[3];

      logger.debug({ topic, deviceSerial, messageType }, 'MQTT message received');

      switch (messageType) {
        case 'telemetry':
          await handleTelemetry(deviceSerial, data);
          break;
        case 'puff':
          await handlePuff(deviceSerial, data);
          break;
        case 'status':
          await handleStatus(deviceSerial, data);
          break;
        case 'location':
          await handleLocation(deviceSerial, data);
          break;
      }
    } catch (error) {
      logger.error({ error, topic }, 'Failed to process MQTT message');
    }
  });

  mqttClient.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') { logger.warn('MQTT broker not available — skipping'); return; }
    logger.error({ err }, 'MQTT error');
  });

  mqttClient.on('disconnect', () => {
    logger.warn('MQTT disconnected');
  });

  mqttClient.on('reconnect', () => {
    logger.info('MQTT reconnecting...');
  });

  return mqttClient;
};

const handleTelemetry = async (deviceSerial, data) => {
  try {
    const device = await Device.findOne({ serialNumber: deviceSerial });
    if (!device) return;

    await Device.findByIdAndUpdate(device._id, {
      batteryLevel: data.battery,
      lastSeen: new Date(),
      status: data.status || 'online'
    });

    // Broadcast to WebSocket clients
    broadcastToUser(device.userId.toString(), 'device:telemetry', {
      deviceId: device._id,
      ...data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error, deviceSerial }, 'Telemetry handling failed');
  }
};

const handlePuff = async (deviceSerial, data) => {
  try {
    const device = await Device.findOne({ serialNumber: deviceSerial });
    if (!device) return;

    const puff = await Puff.create({
      userId: device.userId,
      deviceId: device._id,
      duration: data.duration || 2,
      power: data.power || 20,
      temperature: data.temperature || 200,
      nicotineConsumed: data.nicotineConsumed || 0.018,
      liquidConsumed: data.liquidConsumed || 0.03,
      timestamp: new Date()
    });

    // Update device stats
    await Device.findByIdAndUpdate(device._id, {
      lastSeen: new Date()
    });

    // Broadcast
    broadcastToUser(device.userId.toString(), 'puff:recorded', {
      puffId: puff._id,
      deviceId: device._id,
      ...data,
      timestamp: puff.timestamp
    });
  } catch (error) {
    logger.error({ error, deviceSerial }, 'Puff handling failed');
  }
};

const handleStatus = async (deviceSerial, data) => {
  try {
    const device = await Device.findOne({ serialNumber: deviceSerial });
    if (!device) return;

    await Device.findByIdAndUpdate(device._id, {
      status: data.status,
      lastSeen: new Date(),
      isCharging: data.isCharging || false
    });

    broadcastToUser(device.userId.toString(), 'device:status', {
      deviceId: device._id,
      ...data
    });
  } catch (error) {
    logger.error({ error, deviceSerial }, 'Status handling failed');
  }
};

const handleLocation = async (deviceSerial, data) => {
  try {
    const device = await Device.findOne({ serialNumber: deviceSerial });
    if (!device) return;

    await Device.findByIdAndUpdate(device._id, {
      location: {
        name: data.name || 'Unknown',
        lastUpdated: new Date()
      },
      $push: {
        locationHistory: {
          name: data.name,
          coordinates: data.coordinates,
          timestamp: new Date()
        }
      },
      lastSeen: new Date()
    });

    broadcastToUser(device.userId.toString(), 'device:location', {
      deviceId: device._id,
      ...data
    });
  } catch (error) {
    logger.error({ error, deviceSerial }, 'Location handling failed');
  }
};

// Publish command to device
export const publishToDevice = (deviceSerial, command, payload) => {
  if (!mqttClient) return false;

  const topic = `vapex/devices/${deviceSerial}/command/${command}`;
  mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 });
  logger.info({ topic, command }, 'Command published to device');
  return true;
};

export { mqttClient };
