//! Stateful matching engine: maps a rolling speech transcript onto the
//! blocks of a document, tracking the previous match position so repeated
//! phrases resolve to the nearest occurrence — the same behaviour as the
//! reference web demo's page state.

use crate::r#match::{match_transcript, tokenize, MatchOpts};

/// Result of one engine update: which document block the latest speech
/// window landed in, and how confident the match is.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BlockMatch {
    /// Index into the block list handed to [`MatchEngine::new`].
    pub block_index: usize,
    /// Raw match score in [0, 1] (the matcher's bonus-free score).
    pub confidence: f64,
    /// Inclusive doc-token range that matched.
    pub token_start: usize,
    pub token_end: usize,
}

/// Deterministic matching engine over a fixed document.
#[derive(Debug, Clone)]
pub struct MatchEngine {
    doc_tokens: Vec<String>,
    token_block: Vec<usize>,
    last_index: Option<i64>,
    opts: MatchOpts,
}

impl MatchEngine {
    /// Build an engine over a document given as an ordered list of text
    /// blocks (paragraphs).
    pub fn new(blocks: &[String]) -> Self {
        Self::with_opts(blocks, MatchOpts::default())
    }

    pub fn with_opts(blocks: &[String], opts: MatchOpts) -> Self {
        let mut doc_tokens = Vec::new();
        let mut token_block = Vec::new();
        for (i, block) in blocks.iter().enumerate() {
            for tok in tokenize(block) {
                doc_tokens.push(tok);
                token_block.push(i);
            }
        }
        MatchEngine {
            doc_tokens,
            token_block,
            last_index: None,
            opts,
        }
    }

    pub fn doc_token_count(&self) -> usize {
        self.doc_tokens.len()
    }

    /// Feed the current rolling transcript (full text so far, or a recent
    /// tail); returns the best-matching block, if any window clears the
    /// score floor. Updates internal position state on success.
    pub fn update(&mut self, transcript: &str) -> Option<BlockMatch> {
        let opts = MatchOpts {
            last_index: self.last_index,
            ..self.opts
        };
        let m = match_transcript(&self.doc_tokens, transcript, &opts)?;
        self.last_index = Some(m.end as i64);
        let block_index = self.block_for(m.start, m.end)?;
        Some(BlockMatch {
            block_index,
            confidence: m.score,
            token_start: m.start,
            token_end: m.end,
        })
    }

    /// Forget the previous match position (e.g. the reader jumped).
    pub fn reset_position(&mut self) {
        self.last_index = None;
    }

    /// Block containing the majority of a matched token range.
    /// Ties break toward the block seen first, matching the JS reference's
    /// insertion-ordered Map iteration.
    fn block_for(&self, start: usize, end: usize) -> Option<usize> {
        let mut counts: Vec<(usize, usize)> = Vec::new();
        for i in start..=end {
            let b = *self.token_block.get(i)?;
            match counts.iter_mut().find(|(bb, _)| *bb == b) {
                Some((_, c)) => *c += 1,
                None => counts.push((b, 1)),
            }
        }
        let mut best: Option<(usize, usize)> = None;
        for (b, c) in counts {
            match best {
                Some((_, bc)) if c <= bc => {}
                _ => best = Some((b, c)),
            }
        }
        best.map(|(b, _)| b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc() -> Vec<String> {
        vec![
            "In the year 1878 I took my degree of Doctor of Medicine.".to_owned(),
            "The campaign brought honours and promotion to many.".to_owned(),
            "Worn with pain, and weak from the prolonged hardships.".to_owned(),
            "I had neither kith nor kin in England.".to_owned(),
        ]
    }

    #[test]
    fn follows_speech_through_blocks() {
        let mut e = MatchEngine::new(&doc());
        let m1 = e.update("in the year 1878 I took my degree").unwrap();
        assert_eq!(m1.block_index, 0);
        let m2 = e.update("the campaign brought honours and promotion").unwrap();
        assert_eq!(m2.block_index, 1);
        let m3 = e.update("worn with pain and weak from the prolonged").unwrap();
        assert_eq!(m3.block_index, 2);
    }

    #[test]
    fn tolerates_mishearing() {
        let mut e = MatchEngine::new(&doc());
        let m = e.update("worn with pane and week from the prolonged").unwrap();
        assert_eq!(m.block_index, 2);
        assert!(m.confidence > 0.62);
    }

    #[test]
    fn rejects_unrelated_speech() {
        let mut e = MatchEngine::new(&doc());
        assert!(e.update("completely unrelated grocery shopping list items").is_none());
    }

    #[test]
    fn majority_block_wins_on_straddle() {
        let mut e = MatchEngine::new(&doc());
        // Straddles block 0 (tail) and block 1 (head): majority decides.
        let m = e.update("doctor of medicine the campaign brought honours").unwrap();
        assert_eq!(m.block_index, 1);
    }
}
