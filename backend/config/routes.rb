Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  # Frontend is served from the monorepo root via Driveby::RepoStatic.
end
