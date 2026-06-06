# frozen_string_literal: true

require "json"
require "socket"
require "uri"
require "websocket/driver"

module Driveby
  # Raw WebSocket relay between the browser and the Python RL backend.
  # Protocol matches the previous Node wsRelay: clients connect with
  # ?type=browser or ?type=rl_backend on port 3001.
  class WsRelay
    class Connection
      attr_reader :env, :driver, :socket

      def initialize(socket, env)
        @socket = socket
        @env = env
        # Use the Rack driver: we already consumed the HTTP upgrade request.
        @driver = WebSocket::Driver.rack(self)
      end

      def write(data)
        @socket.write(data)
      end

      def open?
        !@socket.closed?
      end

      def close
        @driver.close rescue nil
        @socket.close rescue nil
      end
    end

    def initialize(host: "0.0.0.0", port: 3001)
      @host = host
      @port = Integer(port)
      @mutex = Mutex.new
      @browser = nil
      @rl_backend = nil
      @server = nil
      @accept_thread = nil
      @running = false
    end

    def start!
      return if @running

      @running = true
      @server = TCPServer.new(@host, @port)
      @accept_thread = Thread.new { accept_loop }
      @accept_thread.abort_on_exception = true
      log("WS relay listening on ws://localhost:#{@port}")
    end

    def stop!
      @running = false
      begin
        @server&.close
      rescue StandardError
        nil
      end
      @accept_thread&.join(1)

      @mutex.synchronize do
        @browser&.close
        @rl_backend&.close
        @browser = nil
        @rl_backend = nil
      end
    end

    def backend_connected?
      @mutex.synchronize { open_client?(@rl_backend) }
    end

    private

    def accept_loop
      while @running
        begin
          socket = @server.accept
        rescue IOError, Errno::EBADF, Errno::EINVAL
          break
        end

        Thread.new(socket) { |s| handle_connection(s) }.tap do |thread|
          thread.abort_on_exception = true
        end
      end
    end

    def handle_connection(socket)
      type = nil
      connection = nil

      env = read_http_env(socket)
      unless env
        socket.close rescue nil
        return
      end

      type = type_from_query(env)
      unless type == "browser" || type == "rl_backend"
        socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
        socket.close rescue nil
        return
      end

      connection = Connection.new(socket, env)
      driver = connection.driver

      driver.on(:open) { register(type, connection) }
      driver.on(:message) { |event| forward(type, event.data) }
      driver.on(:close) { unregister(type, connection) }
      driver.on(:error) { |event| log("WS error (#{type}): #{event.message}") }

      unless driver.start
        log("WS handshake rejected for type=#{type}")
        socket.close rescue nil
        return
      end

      loop do
        data = socket.readpartial(4096)
        driver.parse(data)
      end
    rescue EOFError, Errno::ECONNRESET, Errno::EPIPE, IOError
      # client disconnected
    ensure
      unregister(type, connection) if type && connection
      socket.close rescue nil
    end

    def register(type, connection)
      @mutex.synchronize do
        if type == "browser"
          @browser&.close
          @browser = connection
        else
          @rl_backend&.close
          @rl_backend = connection
        end
      end
      send_backend_status
    end

    def unregister(type, connection)
      @mutex.synchronize do
        if type == "browser" && @browser.equal?(connection)
          @browser = nil
        elsif type == "rl_backend" && @rl_backend.equal?(connection)
          @rl_backend = nil
        end
      end
      send_backend_status
    end

    def forward(from_type, data)
      target =
        @mutex.synchronize do
          from_type == "browser" ? @rl_backend : @browser
        end
      return unless open_client?(target)

      target.driver.text(data.to_s)
    rescue StandardError => e
      log("WS forward failed: #{e.message}")
    end

    def send_backend_status
      browser =
        @mutex.synchronize do
          open_client?(@browser) ? @browser : nil
        end
      return unless browser

      payload = {
        type: "backend_status",
        connected: backend_connected?
      }
      browser.driver.text(JSON.generate(payload))
    rescue StandardError => e
      log("backend_status failed: #{e.message}")
    end

    def open_client?(client)
      !!(client && client.open?)
    end

    def type_from_query(env)
      query = env["QUERY_STRING"].to_s
      URI.decode_www_form(query).to_h["type"]
    end

    def read_http_env(socket)
      request_line = socket.gets
      return nil if request_line.nil? || request_line.empty?

      method, full_path, _version = request_line.strip.split(" ", 3)
      return nil unless method && full_path

      path, query = full_path.split("?", 2)
      headers = {}
      loop do
        line = socket.gets
        break if line.nil? || line == "\r\n" || line == "\n"

        name, value = line.split(":", 2)
        next unless name && value

        headers[name.strip.downcase] = value.strip
      end

      {
        "REQUEST_METHOD" => method,
        "PATH_INFO" => path,
        "QUERY_STRING" => query.to_s,
        "HTTP_HOST" => headers["host"],
        "HTTP_CONNECTION" => headers["connection"],
        "HTTP_UPGRADE" => headers["upgrade"],
        "HTTP_ORIGIN" => headers["origin"],
        "HTTP_SEC_WEBSOCKET_KEY" => headers["sec-websocket-key"],
        "HTTP_SEC_WEBSOCKET_VERSION" => headers["sec-websocket-version"],
        "HTTP_SEC_WEBSOCKET_PROTOCOL" => headers["sec-websocket-protocol"],
        "HTTP_SEC_WEBSOCKET_EXTENSIONS" => headers["sec-websocket-extensions"]
      }
    end

    def log(message)
      if defined?(Rails)
        Rails.logger.info("[Driveby::WsRelay] #{message}")
      else
        warn("[Driveby::WsRelay] #{message}")
      end
    end
  end
end
