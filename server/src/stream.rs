use crate::state::AppState;
use axum::{
    extract::{ConnectInfo, State},
    response::sse::{Event, KeepAlive, Sse},
};
use futures_util::stream::Stream;
use std::{convert::Infallible, net::SocketAddr, time::Duration};
use tokio::sync::broadcast;
use tracing::{info, warn};

pub async fn sse_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let client_ip = addr.ip();

    info!(client_ip = %client_ip, "SSE client connected");

    // Subscribe BEFORE bootstrap so no update can slip through between the
    // snapshot and the live stream. No per-client Redis connection is opened.
    let mut rx = state.flag_tx.subscribe();

    let stream = async_stream::stream! {
        // 1. Signal connection established — SDK clears its local cache on this event.
        yield Ok(Event::default().event("connected").data("true"));

        // 2. Bootstrap: replay the full current flag set so the SDK starts clean.
        let flags = state.store.list_flags();
        let flag_count = flags.len();

        for flag in flags {
            let payload = serde_json::json!({"type": "UPSERT", "flag": flag}).to_string();
            yield Ok(Event::default().event("update").data(payload));
        }

        info!(
            client_ip = %client_ip,
            flags_sent = flag_count,
            "SSE bootstrap complete"
        );

        // 3. Stream live deltas from the shared broadcast channel.
        loop {
            match rx.recv().await {
                Ok(payload) => {
                    yield Ok(Event::default().event("update").data(payload));
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    // Client is too slow to consume updates; force a reconnect so it
                    // re-bootstraps cleanly and recovers a consistent state.
                    warn!(
                        client_ip = %client_ip,
                        missed_messages = n,
                        "SSE client lagged — closing connection to trigger reconnect"
                    );
                    break;
                }
                Err(broadcast::error::RecvError::Closed) => {
                    info!(client_ip = %client_ip, "SSE broadcast channel closed — shutting down stream");
                    break;
                }
            }
        }

        info!(client_ip = %client_ip, "SSE client disconnected");
    };

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive-text"),
    )
}
