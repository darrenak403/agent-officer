//! Timestamps are stored as fixed-width UTC RFC 3339 strings so SQL string order equals time order.

use chrono::{DateTime, SecondsFormat, Utc};

/// Parses an RFC 3339 timestamp (any offset) into the canonical stored form.
pub fn normalize(raw: &str) -> Option<String> {
    DateTime::parse_from_rfc3339(raw).ok().map(|t| t.with_timezone(&Utc).to_rfc3339_opts(SecondsFormat::Millis, true))
}

pub fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Milliseconds since the epoch for a stored timestamp.
pub fn millis(stored: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(stored).ok().map(|t| t.timestamp_millis())
}
