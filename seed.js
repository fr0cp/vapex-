import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Device } from '../models/Device.js';
import { Flavor } from '../models/Flavor.js';
import dotenv from 'dotenv';

dotenv.config();

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vapex');
    console.log('Connected to database');

    // Clear existing data
    await User.deleteMany({});
    await Device.deleteMany({});
    await Flavor.deleteMany({});

    // Create demo user
    const hashedPassword = await bcrypt.hash('vapex123', 12);
    const user = await User.create({
      name: 'Ahmed R.',
      email: 'ahmed@vapex.app',
      password: hashedPassword,
      avatar: 'AR',
      memberSince: new Date('2024-01-15'),
      preferences: {
        notifications: true,
        childLock: true,
        healthMode: true,
        darkMode: true
      }
    });

    console.log('Demo user created:', user.email);

    // Create demo device
    const device = await Device.create({
      userId: user._id,
      name: 'OXVA PRO 2',
      model: 'OXVA-PRO-2',
      serialNumber: 'OXVA2024' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      firmwareVersion: '2.1.4',
      batteryLevel: 72,
      batteryHealth: 94,
      chargeCycles: 142,
      status: 'online',
      lastSeen: new Date(),
      location: {
        name: 'Living Room',
        lastUpdated: new Date()
      },
      locationHistory: [
        { name: 'Living Room', timestamp: new Date(Date.now() - 2 * 60000) },
        { name: 'Car', timestamp: new Date(Date.now() - 60 * 60000) },
        { name: 'Office', timestamp: new Date(Date.now() - 3 * 60 * 60000) }
      ],
      settings: {
        puffLimit: 200,
        sessionTimeout: 30,
        autoLock: true
      }
    });

    console.log('Demo device created:', device.name);

    // Create flavors
    const flavors = await Flavor.insertMany([
      {
        userId: user._id,
        deviceId: device._id,
        name: 'Arctic Mint',
        blend: '50/50',
        nicotineStrength: 18,
        remaining: 30,
        totalCapacity: 50,
        icon: '🧊',
        isActive: true
      },
      {
        userId: user._id,
        deviceId: device._id,
        name: 'Tropical Mango',
        blend: '70/30',
        nicotineStrength: 12,
        remaining: 22,
        totalCapacity: 50,
        icon: '🥭',
        isActive: false
      },
      {
        userId: user._id,
        deviceId: device._id,
        name: 'Blueberry Ice',
        blend: '60/40',
        nicotineStrength: 6,
        remaining: 15,
        totalCapacity: 50,
        icon: '🫐',
        isActive: false
      },
      {
        userId: user._id,
        deviceId: device._id,
        name: 'Classic Tobacco',
        blend: '50/50',
        nicotineStrength: 20,
        remaining: 8,
        totalCapacity: 50,
        icon: '🍂',
        isActive: false
      }
    ]);

    console.log(`${flavors.length} flavors created`);
    console.log('\n✅ Database seeded successfully!');
    console.log('\nDemo credentials:');
    console.log('Email: ahmed@vapex.app');
    console.log('Password: vapex123');

    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
};

seedDatabase();
