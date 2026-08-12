//! Record lifecycle state machine plus serde wire types for the
//! CursorRecord and ReceiptRecord formats defined in jt-contracts
//! (schemas/cursor.schema.json, schemas/receipt.schema.json).
//!
//! The state names below are INTERNAL wire names from the shared schema —
//! they are never shown to people.
//!
//! The schema fixes the set of states; the legal transitions are this
//! kernel's ruling, encoded once here so every platform agrees:
//!
//! ```text
//! rest -> invitation
//! invitation -> acquisition | rest
//! acquisition -> provisional-intention | rest
//! provisional-intention -> candidate | ambiguity | acquisition | rest
//! candidate -> settlement | ambiguity | acquisition | rest
//! ambiguity -> candidate | acquisition | rest
//! settlement -> durable-result | candidate | rest
//! durable-result -> recession
//! recession -> return
//! return -> rest
//! ```
//!
//! Backward edges to `acquisition` are the repair path (recapture after a
//! wrong guess); edges to `rest` are abandonment before anything durable
//! happened. Once a result is durable the only way forward is the ordered
//! wind-down: durable-result -> recession -> return -> rest.

use serde::{Deserialize, Serialize};

/// Lifecycle position of a piece of work. Wire names per the shared schema.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CursorState {
    #[serde(rename = "rest")]
    Rest,
    #[serde(rename = "invitation")]
    Invitation,
    #[serde(rename = "acquisition")]
    Acquisition,
    #[serde(rename = "provisional-intention")]
    ProvisionalIntention,
    #[serde(rename = "candidate")]
    Candidate,
    #[serde(rename = "ambiguity")]
    Ambiguity,
    #[serde(rename = "settlement")]
    Settlement,
    #[serde(rename = "durable-result")]
    DurableResult,
    #[serde(rename = "recession")]
    Recession,
    #[serde(rename = "return")]
    Return,
}

impl CursorState {
    pub const ALL: [CursorState; 10] = [
        CursorState::Rest,
        CursorState::Invitation,
        CursorState::Acquisition,
        CursorState::ProvisionalIntention,
        CursorState::Candidate,
        CursorState::Ambiguity,
        CursorState::Settlement,
        CursorState::DurableResult,
        CursorState::Recession,
        CursorState::Return,
    ];

    /// The wire name for this state.
    pub fn wire_name(self) -> &'static str {
        match self {
            CursorState::Rest => "rest",
            CursorState::Invitation => "invitation",
            CursorState::Acquisition => "acquisition",
            CursorState::ProvisionalIntention => "provisional-intention",
            CursorState::Candidate => "candidate",
            CursorState::Ambiguity => "ambiguity",
            CursorState::Settlement => "settlement",
            CursorState::DurableResult => "durable-result",
            CursorState::Recession => "recession",
            CursorState::Return => "return",
        }
    }

    pub fn from_wire_name(s: &str) -> Option<CursorState> {
        CursorState::ALL.iter().copied().find(|st| st.wire_name() == s)
    }

    /// The states this state may legally move to.
    pub fn legal_transitions(self) -> &'static [CursorState] {
        use CursorState::*;
        match self {
            Rest => &[Invitation],
            Invitation => &[Acquisition, Rest],
            Acquisition => &[ProvisionalIntention, Rest],
            ProvisionalIntention => &[Candidate, Ambiguity, Acquisition, Rest],
            Candidate => &[Settlement, Ambiguity, Acquisition, Rest],
            Ambiguity => &[Candidate, Acquisition, Rest],
            Settlement => &[DurableResult, Candidate, Rest],
            DurableResult => &[Recession],
            Recession => &[Return],
            Return => &[Rest],
        }
    }

    pub fn can_transition_to(self, next: CursorState) -> bool {
        self.legal_transitions().contains(&next)
    }
}

/// A rejected state change.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IllegalTransition {
    pub from: CursorState,
    pub to: CursorState,
}

impl std::fmt::Display for IllegalTransition {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "illegal transition {} -> {}",
            self.from.wire_name(),
            self.to.wire_name()
        )
    }
}

impl std::error::Error for IllegalTransition {}

/// Whether proof of arrival at the destination has been asked for, is
/// awaited, has arrived, or was refused. (Internal wire values.)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReceiptState {
    #[serde(rename = "not-requested")]
    NotRequested,
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "received")]
    Received,
    #[serde(rename = "refused")]
    Refused,
}

/// How the result reached its destination. (Internal wire values.)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Arrival {
    #[serde(rename = "exact")]
    Exact,
    #[serde(rename = "degraded")]
    Degraded,
    #[serde(rename = "refused")]
    Refused,
}

/// One step in a cursor's history.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
    pub event: String,
}

/// A person's live act of working at an exact position in a source.
/// Mirrors jt-contracts cursor.schema.json v0.1.0 exactly
/// (additionalProperties: false -> deny_unknown_fields).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CursorRecord {
    pub schema_version: String,
    pub id: String,
    pub anchor_id: String,
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_modality: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub captured_evidence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alternatives: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposed_intention: Option<String>,
    pub state: CursorState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authority_required: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub destination: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub persistence_state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receipt_state: Option<ReceiptState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history: Option<Vec<HistoryEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub undo_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repair_route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_route: Option<String>,
}

/// Durable proof of what actually happened when an action ran.
/// Mirrors jt-contracts receipt.schema.json v0.1.0 exactly.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReceiptRecord {
    pub schema_version: String,
    pub id: String,
    pub source_id: String,
    pub source_revision: String,
    pub action_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build: Option<String>,
    pub result: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact_digest: Option<String>,
    pub occurred_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authority: Option<String>,
    pub arrival: Arrival,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub degradation_note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub undo_route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repair_route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery_route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_route: Option<String>,
}

/// Validation failure for a record that parsed but breaks a schema
/// constraint serde alone cannot express.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationError(pub String);

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "validation error: {}", self.0)
    }
}
impl std::error::Error for ValidationError {}

fn check_semver(field: &str, v: &str) -> Result<(), ValidationError> {
    let parts: Vec<&str> = v.split('.').collect();
    let ok = parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()));
    if ok {
        Ok(())
    } else {
        Err(ValidationError(format!(
            "{field} must be semver major.minor.patch, got {v:?}"
        )))
    }
}

fn check_non_empty(field: &str, v: &str) -> Result<(), ValidationError> {
    if v.is_empty() {
        Err(ValidationError(format!("{field} must not be empty")))
    } else {
        Ok(())
    }
}

impl CursorRecord {
    /// A fresh cursor at rest.
    pub fn new(id: &str, anchor_id: &str, source_id: &str) -> CursorRecord {
        CursorRecord {
            schema_version: "0.1.0".to_owned(),
            id: id.to_owned(),
            anchor_id: anchor_id.to_owned(),
            source_id: source_id.to_owned(),
            origin_modality: None,
            origin_device_id: None,
            captured_evidence: None,
            alternatives: None,
            proposed_intention: None,
            state: CursorState::Rest,
            authority_required: None,
            destination: None,
            persistence_state: None,
            receipt_state: None,
            history: None,
            undo_available: None,
            repair_route: None,
            return_route: None,
        }
    }

    /// Schema constraints beyond shape: semver pattern and minLength: 1.
    pub fn validate(&self) -> Result<(), ValidationError> {
        check_semver("schemaVersion", &self.schema_version)?;
        check_non_empty("id", &self.id)?;
        check_non_empty("anchorId", &self.anchor_id)?;
        check_non_empty("sourceId", &self.source_id)?;
        if let Some(alts) = &self.alternatives {
            for a in alts {
                check_non_empty("alternatives[]", a)?;
            }
        }
        if let Some(history) = &self.history {
            for h in history {
                check_non_empty("history[].event", &h.event)?;
            }
        }
        Ok(())
    }

    pub fn from_json(json: &str) -> Result<CursorRecord, Box<dyn std::error::Error>> {
        let rec: CursorRecord = serde_json::from_str(json)?;
        rec.validate()?;
        Ok(rec)
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("CursorRecord serializes")
    }

    /// Move this cursor to `next`, recording the step in history.
    /// Fails without mutating on an illegal transition.
    pub fn transition(&mut self, next: CursorState, at: Option<&str>) -> Result<(), IllegalTransition> {
        if !self.state.can_transition_to(next) {
            return Err(IllegalTransition {
                from: self.state,
                to: next,
            });
        }
        let event = format!("state {} -> {}", self.state.wire_name(), next.wire_name());
        self.state = next;
        self.history.get_or_insert_with(Vec::new).push(HistoryEntry {
            at: at.map(str::to_owned),
            event,
        });
        Ok(())
    }
}

impl ReceiptRecord {
    /// Schema constraints beyond shape: semver, minLength: 1, digest pattern.
    pub fn validate(&self) -> Result<(), ValidationError> {
        check_semver("schemaVersion", &self.schema_version)?;
        check_non_empty("id", &self.id)?;
        check_non_empty("sourceId", &self.source_id)?;
        check_non_empty("sourceRevision", &self.source_revision)?;
        check_non_empty("actionId", &self.action_id)?;
        check_non_empty("result", &self.result)?;
        if let Some(d) = &self.artifact_digest {
            let hex = d.strip_prefix("sha256:");
            let ok = matches!(hex, Some(h) if h.len() == 64
                && h.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)));
            if !ok {
                return Err(ValidationError(format!(
                    "artifactDigest must match sha256:<64 lowercase hex>, got {d:?}"
                )));
            }
        }
        Ok(())
    }

    pub fn from_json(json: &str) -> Result<ReceiptRecord, Box<dyn std::error::Error>> {
        let rec: ReceiptRecord = serde_json::from_str(json)?;
        rec.validate()?;
        Ok(rec)
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("ReceiptRecord serializes")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_forward_walk_is_legal() {
        use CursorState::*;
        let mut c = CursorRecord::new("cur-1", "anc-1", "src-1");
        for next in [
            Invitation,
            Acquisition,
            ProvisionalIntention,
            Candidate,
            Settlement,
            DurableResult,
            Recession,
            Return,
            Rest,
        ] {
            c.transition(next, Some("2026-08-11T00:00:00Z")).unwrap();
        }
        assert_eq!(c.state, Rest);
        assert_eq!(c.history.as_ref().unwrap().len(), 9);
    }

    #[test]
    fn illegal_transitions_rejected_without_mutation() {
        use CursorState::*;
        let mut c = CursorRecord::new("cur-1", "anc-1", "src-1");
        let err = c.transition(DurableResult, None).unwrap_err();
        assert_eq!(err, IllegalTransition { from: Rest, to: DurableResult });
        assert_eq!(c.state, Rest);
        assert!(c.history.is_none());
        // Once durable, no shortcut back to rest.
        c.state = DurableResult;
        assert!(c.transition(Rest, None).is_err());
        assert!(c.transition(Recession, None).is_ok());
    }

    #[test]
    fn ambiguity_repair_loop() {
        use CursorState::*;
        let mut c = CursorRecord::new("cur-1", "anc-1", "src-1");
        for next in [Invitation, Acquisition, ProvisionalIntention, Ambiguity, Acquisition] {
            c.transition(next, None).unwrap();
        }
        assert_eq!(c.state, Acquisition);
    }

    #[test]
    fn transition_matrix_is_exactly_the_documented_one() {
        // 10 states; count legal edges to catch accidental drift.
        let total: usize = CursorState::ALL.iter().map(|s| s.legal_transitions().len()).sum();
        assert_eq!(total, 1 + 2 + 2 + 4 + 4 + 3 + 3 + 1 + 1 + 1);
    }

    #[test]
    fn wire_names_round_trip() {
        for s in CursorState::ALL {
            assert_eq!(CursorState::from_wire_name(s.wire_name()), Some(s));
            let j = serde_json::to_string(&s).unwrap();
            assert_eq!(j, format!("\"{}\"", s.wire_name()));
        }
    }

    #[test]
    fn validate_rejects_bad_fields() {
        let mut c = CursorRecord::new("cur-1", "anc-1", "src-1");
        c.schema_version = "1.0".to_owned();
        assert!(c.validate().is_err());
        let mut c = CursorRecord::new("", "anc-1", "src-1");
        assert!(c.validate().is_err());
        c.id = "x".into();
        assert!(c.validate().is_ok());
    }

    #[test]
    fn receipt_digest_pattern() {
        let json = r#"{"schemaVersion":"0.1.0","id":"rcp-1","sourceId":"s","sourceRevision":"r1",
            "actionId":"a","result":"ok","arrival":"exact","occurredAt":"2026-08-11T00:00:00Z",
            "artifactDigest":"sha256:ZZ"}"#;
        assert!(ReceiptRecord::from_json(json).is_err());
    }
}
