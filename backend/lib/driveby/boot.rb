# frozen_string_literal: true

require_relative "ws_relay"

module Driveby
  module Boot
    class << self
      attr_reader :relay

      def start!
        return if @started

        @started = true
        @relay = Driveby::WsRelay.new(port: ENV.fetch("DRIVEBY_WS_PORT", 3001))
        @relay.start!

        at_exit { stop! }
      end

      def stop!
        @relay&.stop!
      end
    end
  end
end
