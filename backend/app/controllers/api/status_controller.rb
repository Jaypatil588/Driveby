# frozen_string_literal: true

module Api
  class StatusController < ApplicationController
    def show
      render json: {
        server: "rails",
        relay: {
          port: Integer(ENV.fetch("DRIVEBY_WS_PORT", 3001)),
          backend_connected: Driveby::Boot.relay&.backend_connected? || false
        },
        rl_backend: {
          running: Driveby::Boot.rl_supervisor&.running? || false,
          skipped: ENV["DRIVEBY_SKIP_RL"] == "1"
        }
      }
    end
  end
end
