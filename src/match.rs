//! Fuzzy n-gram matcher: maps a window of spoken words onto a token stream
//! extracted from a document's text layer.
//!
//! Approach ("two anchors, fuzzy middle"): the first and last words of the
//! spoken window are weighted as anchors; interior words tolerate ASR errors
//! via character-bigram similarity. The best-scoring window of document
//! tokens wins, with a small proximity bonus so repeated phrases resolve to
//! the occurrence nearest the reader's current position.
//!
//! This is a semantics-faithful port of the reference JavaScript
//! implementation (jt-demo-voice-highlight/src/match.js). Operation order is
//! preserved so f64 results are bit-identical to the JS engine, including
//! its NaN edge cases (two distinct single-character tokens compare 0/0).

use unicode_normalization::UnicodeNormalization;
use unicode_properties::{GeneralCategoryGroup, UnicodeGeneralCategory};

#[inline]
fn is_alnum(c: char) -> bool {
    // JS \p{L} == char::is_alphabetic (Lu, Ll, Lt, Lm, Lo);
    // JS \p{N} == char::is_numeric (Nd, Nl, No).
    c.is_alphabetic() || c.is_numeric()
}

/// Normalize prose for matching (not for display).
///
/// Pipeline (identical to the JS reference):
/// 1. NFKD normalize, 2. strip combining marks (`\p{M}`), 3. lowercase,
/// 4. join `x'y` -> `xy` between letters/digits (single left-to-right pass,
///    like a JS global regex), 5. `&` -> ` and `,
/// 6. collapse runs of non-alphanumerics to single spaces, 7. trim.
pub fn normalize(text: &str) -> String {
    // 1 + 2: NFKD, strip marks.
    let stripped: String = text
        .nfkd()
        .filter(|c| c.general_category_group() != GeneralCategoryGroup::Mark)
        .collect();
    // 3: lowercase.
    let lower = stripped.to_lowercase();
    // 4: apostrophe joining with JS global-regex scan semantics:
    // a match consumes three chars (alnum, quote, alnum) and the scan
    // resumes after them, so "a'b'c" -> "ab'c".
    let chars: Vec<char> = lower.chars().collect();
    let mut joined = String::with_capacity(lower.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if is_alnum(c)
            && i + 2 < chars.len()
            && (chars[i + 1] == '\'' || chars[i + 1] == '\u{2019}')
            && is_alnum(chars[i + 2])
        {
            joined.push(c);
            joined.push(chars[i + 2]);
            i += 3;
        } else {
            joined.push(c);
            i += 1;
        }
    }
    // 5: ampersand becomes the word "and".
    let anded = joined.replace('&', " and ");
    // 6 + 7: collapse non-alnum runs to single interior spaces, trim.
    let mut out = String::with_capacity(anded.len());
    let mut pending_sep = false;
    for c in anded.chars() {
        if is_alnum(c) {
            if pending_sep && !out.is_empty() {
                out.push(' ');
            }
            pending_sep = false;
            out.push(c);
        } else {
            pending_sep = true;
        }
    }
    out
}

/// Split text into normalized word tokens.
pub fn tokenize(text: &str) -> Vec<String> {
    let n = normalize(text);
    if n.is_empty() {
        Vec::new()
    } else {
        n.split(' ').map(str::to_owned).collect()
    }
}

/// Character bigrams of a token.
fn bigrams(token: &str) -> Vec<(char, char)> {
    let chars: Vec<char> = token.chars().collect();
    let mut grams = Vec::new();
    if chars.len() >= 2 {
        for w in chars.windows(2) {
            grams.push((w[0], w[1]));
        }
    }
    grams
}

/// Similarity of two tokens in [0, 1].
/// Exact match is 1; otherwise Sorensen-Dice over character bigrams,
/// which forgives typical ASR slips ("holmes" vs "homes").
///
/// Faithful to the JS reference: two distinct single-char tokens yield
/// 0/0 = NaN, which then loses every comparison downstream exactly as the
/// JS engine's NaN does.
pub fn token_similarity(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let ga = bigrams(a);
    let gb = bigrams(b);
    let mut counts: std::collections::HashMap<(char, char), i64> = std::collections::HashMap::new();
    for g in &ga {
        *counts.entry(*g).or_insert(0) += 1;
    }
    let mut shared: i64 = 0;
    for g in &gb {
        if let Some(c) = counts.get_mut(g) {
            if *c > 0 {
                shared += 1;
                *c -= 1;
            }
        }
    }
    (2.0 * shared as f64) / ((ga.len() + gb.len()) as f64)
}

/// Options for [`find_match`] / [`match_transcript`].
#[derive(Debug, Clone, Copy)]
pub struct MatchOpts {
    /// Below this raw score, report no match.
    pub min_score: f64,
    /// First and last spoken tokens count more.
    pub anchor_weight: f64,
    /// Max bonus for matching near `last_index`.
    pub proximity_bonus: f64,
    /// Doc-token index of the previous match; nearby occurrences of
    /// ambiguous phrases get a small bonus.
    pub last_index: Option<i64>,
    /// Window of trailing transcript words considered by
    /// [`match_transcript`].
    pub window_size: usize,
}

impl Default for MatchOpts {
    fn default() -> Self {
        MatchOpts {
            min_score: 0.62,
            anchor_weight: 1.6,
            proximity_bonus: 0.04,
            last_index: None,
            window_size: 8,
        }
    }
}

/// A matched window of document tokens. `start`/`end` are inclusive
/// doc-token indices; `score` is the raw (bonus-free) score.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MatchResult {
    pub start: usize,
    pub end: usize,
    pub score: f64,
}

/// Find the best window of `doc_tokens` matching `spoken_tokens`.
/// Returns `None` when nothing clears `min_score`.
pub fn find_match(doc_tokens: &[String], spoken_tokens: &[String], opts: &MatchOpts) -> Option<MatchResult> {
    let n = doc_tokens.len();
    let m = spoken_tokens.len();
    if m == 0 || n == 0 || m > n {
        return None;
    }

    // Anchor-weighted per-position weights.
    let mut weights = vec![1.0f64; m];
    if m >= 2 {
        weights[0] = opts.anchor_weight;
        weights[m - 1] = opts.anchor_weight;
    }
    // Same accumulation order as the JS reduce.
    let mut weight_sum = 0.0f64;
    for w in &weights {
        weight_sum += *w;
    }

    struct Best {
        start: usize,
        score: f64,
        raw: f64,
    }
    let mut best: Option<Best> = None;

    for s in 0..=(n - m) {
        let mut acc = 0.0f64;
        let mut remaining = weight_sum;
        let mut bailed = false;
        for i in 0..m {
            acc += weights[i] * token_similarity(&spoken_tokens[i], &doc_tokens[s + i]);
            remaining -= weights[i];
            // Even a perfect tail plus max bonus can't beat the current best: bail.
            if let Some(b) = &best {
                if (acc + remaining) / weight_sum + opts.proximity_bonus <= b.score {
                    bailed = true;
                    break;
                }
            }
        }
        if bailed {
            continue;
        }
        let raw = acc / weight_sum;
        let mut score = raw;
        if let Some(last_index) = opts.last_index {
            if n > 1 {
                let dist = (s as i64 - last_index).unsigned_abs() as f64;
                let n_f = n as f64;
                score += opts.proximity_bonus * (1.0 - dist.min(n_f) / n_f);
            }
        }
        // NaN loses this comparison, exactly like in JS.
        let better = match &best {
            None => true,
            Some(b) => score > b.score,
        };
        if better {
            best = Some(Best { start: s, score, raw });
        }
    }

    match best {
        Some(b) if !(b.raw < opts.min_score) => Some(MatchResult {
            start: b.start,
            end: b.start + m - 1,
            score: b.raw,
        }),
        _ => None,
    }
}

/// Convenience for the live path: match the last `window_size` words of a
/// running transcript against the document.
pub fn match_transcript(doc_tokens: &[String], transcript: &str, opts: &MatchOpts) -> Option<MatchResult> {
    let words = tokenize(transcript);
    if words.is_empty() {
        return None;
    }
    let start = words.len().saturating_sub(opts.window_size);
    let spoken = &words[start..];
    // Very short windows are too ambiguous to act on.
    if spoken.len() < 3 {
        return None;
    }
    find_match(doc_tokens, spoken, opts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_basics() {
        assert_eq!(normalize("  Hello,   World! "), "hello world");
        assert_eq!(normalize("don't"), "dont");
        assert_eq!(normalize("don\u{2019}t"), "dont");
        assert_eq!(normalize("R&D"), "r and d");
        assert_eq!(normalize("café"), "cafe");
        assert_eq!(normalize(""), "");
        assert_eq!(normalize("---"), "");
    }

    #[test]
    fn normalize_apostrophe_scan_matches_js_global_regex() {
        // JS: "a'b'c" -> "ab'c" -> tokens ["ab", "c"]
        assert_eq!(normalize("a'b'c"), "ab c");
        assert_eq!(normalize("o'brien's"), "obriens");
    }

    #[test]
    fn tokenize_empty() {
        assert!(tokenize("  ...  ").is_empty());
    }

    #[test]
    fn similarity_edges() {
        assert_eq!(token_similarity("holmes", "holmes"), 1.0);
        assert_eq!(token_similarity("", "x"), 0.0);
        assert!(token_similarity("holmes", "homes") > 0.6);
        // JS parity: two distinct single chars -> 0/0 -> NaN.
        assert!(token_similarity("a", "b").is_nan());
        assert_eq!(token_similarity("a", "ab"), 0.0);
    }

    #[test]
    fn find_match_finds_exact_phrase() {
        let doc = tokenize("the quick brown fox jumps over the lazy dog");
        let spoken = tokenize("brown fox jumps");
        let m = find_match(&doc, &spoken, &MatchOpts::default()).unwrap();
        assert_eq!((m.start, m.end), (2, 4));
        assert_eq!(m.score, 1.0);
    }

    #[test]
    fn find_match_absorbs_mishearing() {
        let doc = tokenize("sherlock holmes took his bottle from the corner of the mantelpiece");
        let spoken = tokenize("sherlock homes took his bottle");
        let m = find_match(&doc, &spoken, &MatchOpts::default()).unwrap();
        assert_eq!(m.start, 0);
        assert!(m.score > 0.62 && m.score < 1.0);
    }

    #[test]
    fn find_match_respects_min_score() {
        let doc = tokenize("alpha beta gamma delta epsilon");
        let spoken = tokenize("zebra walrus penguin");
        assert!(find_match(&doc, &spoken, &MatchOpts::default()).is_none());
    }

    #[test]
    fn proximity_bonus_prefers_nearby_repeat() {
        // The same phrase occurs twice; last_index near the second occurrence
        // should pull the match there.
        let doc = tokenize("one two three filler filler filler filler filler filler one two three end");
        let spoken = tokenize("one two three");
        let far = find_match(
            &doc,
            &spoken,
            &MatchOpts {
                last_index: Some(9),
                ..MatchOpts::default()
            },
        )
        .unwrap();
        assert_eq!(far.start, 9);
        let near_start = find_match(
            &doc,
            &spoken,
            &MatchOpts {
                last_index: Some(0),
                ..MatchOpts::default()
            },
        )
        .unwrap();
        assert_eq!(near_start.start, 0);
    }

    #[test]
    fn match_transcript_windows_and_short_input() {
        let doc = tokenize("the quick brown fox jumps over the lazy dog");
        assert!(match_transcript(&doc, "so", &MatchOpts::default()).is_none());
        assert!(match_transcript(&doc, "", &MatchOpts::default()).is_none());
        let m = match_transcript(
            &doc,
            "well anyway the quick brown fox jumps over the lazy dog",
            &MatchOpts::default(),
        )
        .unwrap();
        assert_eq!(m.end, 8);
    }
}
