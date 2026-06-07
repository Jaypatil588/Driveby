# MoWay Rails backend

Ruby on Rails server for the MoWay simulator.

## Responsibilities

- Serve the browser frontend from the monorepo root
- WebSocket relay on port `3001` (`?type=browser` / `?type=rl_backend`)
- Supervise the Python RL worker (`rl/server.py`)
- JSON status API at `GET /api/status`
- Action Cable channel `SimulationChannel` for Rails-native status

## Setup

```bash
cd backend
bundle install
bin/rails db:prepare
```

Requires Ruby 3.2+ (developed on Ruby 4.0 / Rails 8.1).

## Run

From the repo root:

```bash
npm run start          # Rails only (also starts WS relay + RL worker)
npm run dev            # webpack watch + Rails
```

Skip the Python worker with `DRIVEBY_SKIP_RL=1`.

Change the relay port with `DRIVEBY_WS_PORT` (default `3001`).
