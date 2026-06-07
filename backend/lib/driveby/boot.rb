# frozen_string_literal: true

require_relative "ws_relay"
require_relative "rl_supervisor"

module Driveby
  module Boot
    class << self
      attr_reader :relay, :rl_supervisor

      def start!
        return if @started

        @started = true
        repo_root = Rails.root.join("..").expand_path

        @relay = Driveby::WsRelay.new(port: ENV.fetch("DRIVEBY_WS_PORT", 3001))
        @relay.start!

        script = repo_root.join("rl", "server.py")
        @rl_supervisor = Driveby::RlSupervisor.new(script_path: script)
        @rl_supervisor.start! unless ENV["DRIVEBY_SKIP_RL"] == "1"

        at_exit { stop! }
      end

      def stop!
        @rl_supervisor&.stop!
        @relay&.stop!
      end
    end
  end
end
