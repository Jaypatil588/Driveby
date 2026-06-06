class ApplicationController < ActionController::Base
  # Simulator backend: browser clients talk to Rails over HTTP + Action Cable.
  # CSRF is not required for the JSON status API.
  protect_from_forgery with: :null_session
end
