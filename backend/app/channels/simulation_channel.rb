# frozen_string_literal: true

# Action Cable channel for simulator status (Rails-native realtime surface).
# The browser/Python RL traffic still uses the raw WS relay on port 3001 for
# protocol compatibility; this channel exposes health to Rails clients.
class SimulationChannel < ApplicationCable::Channel
  def subscribed
    stream_from "simulation_status"
    transmit(
      type: "backend_status",
      connected: Driveby::Boot.relay&.backend_connected? || false,
      server: "rails"
    )
  end
end
