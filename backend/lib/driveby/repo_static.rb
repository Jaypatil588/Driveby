# frozen_string_literal: true

require "rack/files"

module Driveby
  # Serves the simulator frontend from the monorepo root (sibling of backend/).
  class RepoStatic
    PASS_PREFIXES = %w[/api /cable /rails /up /assets].freeze

    def initialize(app, root:)
      @app = app
      @root = root.to_s
      @files = Rack::Files.new(@root)
    end

    def call(env)
      path = env["PATH_INFO"].to_s
      return @app.call(env) if pass_through?(path)

      file_env = env.dup
      file_env["PATH_INFO"] = "/index.html" if path == "/" || path.empty?

      status, headers, body = @files.call(file_env)
      return @app.call(env) if status == 404

      [status, headers, body]
    end

    private

    def pass_through?(path)
      PASS_PREFIXES.any? { |prefix| path == prefix || path.start_with?("#{prefix}/") }
    end
  end
end
