# frozen_string_literal: true

# Spawns and restarts the Python RL WebSocket worker (rl/server.py).
require "open3"

module Driveby
  class RlSupervisor
    def initialize(script_path:, restart_delay: 1.0)
      @script_path = File.expand_path(script_path.to_s)
      @repo_root = File.expand_path("..", File.dirname(@script_path))
      @restart_delay = restart_delay
      @mutex = Mutex.new
      @wait_thread = nil
      @pid = nil
      @shutting_down = false
    end

    def start!
      spawn_backend
    end

    def stop!
      @shutting_down = true
      pid = @mutex.synchronize { @pid }
      return unless pid

      begin
        Process.kill("TERM", pid)
      rescue Errno::ESRCH
        nil
      end
      @wait_thread&.join(2)
    end

    def running?
      pid = @mutex.synchronize { @pid }
      return false unless pid

      Process.kill(0, pid)
      true
    rescue Errno::ESRCH
      false
    end

    private

    def spawn_backend
      return if @shutting_down

      _stdin, stdout, stderr, wait_thr = Open3.popen3(
        { "PYTHONUNBUFFERED" => "1" },
        "python3", "-u", @script_path,
        chdir: @repo_root
      )
      _stdin.close

      pid = wait_thr.pid
      @mutex.synchronize { @pid = pid }
      log("RL backend started pid=#{pid}")

      forward_stream(stdout, $stdout)
      forward_stream(stderr, $stderr)

      @wait_thread = Thread.new do
        status = wait_thr.value
        @mutex.synchronize { @pid = nil if @pid == pid }
        stdout.close rescue nil
        stderr.close rescue nil

        if @shutting_down
          log("RL backend stopped: #{status.inspect}")
        else
          log("RL backend exited unexpectedly (#{status.inspect}). Restarting...")
          sleep @restart_delay
          spawn_backend unless @shutting_down
        end
      end
      @wait_thread.abort_on_exception = true
    rescue StandardError => e
      log("Failed to start RL backend: #{e.message}")
      return if @shutting_down

      sleep @restart_delay
      spawn_backend unless @shutting_down
    end

    def forward_stream(io, dest)
      Thread.new do
        IO.copy_stream(io, dest)
      rescue StandardError
        nil
      end
    end

    def log(message)
      if defined?(Rails)
        Rails.logger.info("[Driveby::RlSupervisor] #{message}")
      else
        warn("[Driveby::RlSupervisor] #{message}")
      end
    end
  end
end
