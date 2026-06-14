use crate::state::AppState;
use axum::{Json, Router, extract::State, routing::get};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ConnectedClientView {
    pub connection_id: String,
    pub environment_id: Option<String>,
    pub sdk_key_name: Option<String>,
    pub client_ip: String,
    pub connected_at: i64,
}

pub fn read_router() -> Router<AppState> {
    Router::new().route("/health/connections", get(list_connections))
}

async fn list_connections(State(state): State<AppState>) -> Json<Vec<ConnectedClientView>> {
    let mut clients: Vec<ConnectedClientView> = state
        .connected_clients
        .iter()
        .map(|entry| {
            let c = entry.value();
            ConnectedClientView {
                connection_id: c.connection_id.clone(),
                environment_id: c.environment_id.clone(),
                sdk_key_name: c.sdk_key_name.clone(),
                client_ip: c.client_ip.clone(),
                connected_at: c.connected_at,
            }
        })
        .collect();

    // Stable ordering so the dashboard doesn't jump around.
    clients.sort_by_key(|c| c.connected_at);
    Json(clients)
}
