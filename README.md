# VAPEX Control Center — Professional Edition

A full-stack IoT vape device management platform with real-time WebSocket, MQTT, and a polished dark-mode dashboard.

## Tech Stack
- **Backend:** Node.js 18+ · Express 4 · MongoDB / Mongoose 8
- **Auth:** JWT (access + refresh tokens) · bcryptjs
- **Realtime:** Socket.IO + MQTT
- **Frontend:** Vanilla JS ES2020 · CSS Custom Properties · Web Fonts (Bebas Neue, Inter, JetBrains Mono)
- **DevOps:** Docker Compose · Nodemon

---

## Quick Start

### 1 — Prerequisites
```bash
node -v  # 18+
mongod --version
```

### 2 — Install & seed
```bash
npm install
cp .env.example .env   # edit if needed
npm run seed           # creates demo user + devices
```

### 3 — Run
```bash
npm run dev            # development (auto-restart)
npm start              # production
```
Open **http://localhost:3000**

Demo credentials (created by seed):
- Email: `ahmed@vapex.app`
- Password: `vapex123`

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/register` | Register |
| GET  | `/api/v1/auth/me` | Current user |
| POST | `/api/v1/auth/logout` | Logout |
| GET  | `/api/v1/devices` | List devices |
| POST | `/api/v1/devices` | Create device |
| POST | `/api/v1/puffs` | Record puff |
| GET  | `/api/v1/puffs/today` | Today's stats |
| DELETE | `/api/v1/puffs/today` | Reset today |
| GET  | `/api/v1/analytics/weekly` | Weekly chart |
| GET  | `/api/v1/analytics/nicotine` | Nicotine analytics |
| GET  | `/api/v1/analytics/battery` | Battery analytics |
| GET  | `/api/v1/goals/nicotine-reduction/active` | Active goal |
| GET  | `/api/v1/goals/puff-limit/status` | Limit status |
| GET  | `/api/v1/flavors` | List flavors |
| GET  | `/api/v1/flavors/active` | Active flavor |
| PATCH | `/api/v1/flavors/:id/activate` | Activate flavor |
| GET  | `/api/v1/coils/device/:id/active` | Active coil |
| GET  | `/api/v1/liquids/overview` | Liquid overview |
| GET  | `/api/v1/find/:id/location` | Device location |
| POST | `/api/v1/find/:id/ring` | Ring device |
| PATCH | `/api/v1/settings/preferences` | Update preferences |
| PATCH | `/api/v1/settings/device/:id` | Update device settings |
| POST | `/api/v1/cloud/sync` | Cloud sync |
| GET  | `/api/v1/smart-modes/:id/current` | Current mode |
| POST | `/api/v1/smart-modes/:id/set` | Set mode |
| GET  | `/api/v1/health` | Health check |

---

## Docker
```bash
docker-compose up -d
```

---

## Dashboard Features
- 📊 Real-time puff tracking with animated counter
- 🔋 Live battery monitoring with animated fill
- 💨 Flavor management with quick rotation
- 🎯 Nicotine & puff limit goals with progress rings
- ⚡ Smart mode switching (Eco / Flavor / Cloud / Stealth / Auto)
- 🔍 Device locator with radar animation
- ☁️ Cloud sync & backup
- 🔔 Preferences: Notifications, Child lock, Health mode
- ⌨️ Keyboard navigation (← → arrow keys)
- 📱 Fully responsive: desktop sidebar + mobile bottom nav
