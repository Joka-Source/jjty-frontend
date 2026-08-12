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
//! preserved so f64 results are bit-identical to the JS engine.

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

/// Character bigrams of a token, including boundary markers, packed into
/// u64s and SORTED. The reference implementation pads with U+0002/U+0003
/// (STX/ETX), so a one-character token still yields two bigrams and
/// boundary characters participate in similarity. Multiset intersection
/// size is order-independent, so sorting changes nothing about the score
/// while enabling a linear merge in [`dice`].
fn bigrams(token: &str) -> Vec<u64> {
    let mut prev = '\u{2}';
    let mut grams: Vec<u64> = Vec::with_capacity(token.len() + 2);
    for c in token.chars() {
        grams.push(((prev as u64) << 32) | c as u64);
        prev = c;
    }
    grams.push(((prev as u64) << 32) | '\u{3}' as u64);
    grams.sort_unstable();
    grams
}

/// Sorensen-Dice coefficient over two sorted bigram lists. The shared
/// count is the multiset intersection size — exactly what the JS
/// reference's count-then-consume loop computes — via a linear merge.
fn dice(ga: &[u64], gb: &[u64]) -> f64 {
    let mut shared: usize = 0;
    let (mut i, mut j) = (0usize, 0usize);
    while i < ga.len() && j < gb.len() {
        match ga[i].cmp(&gb[j]) {
            std::cmp::Ordering::Less => i += 1,
            std::cmp::Ordering::Greater => j += 1,
            std::cmp::Ordering::Equal => {
                shared += 1;
                i += 1;
                j += 1;
            }
        }
    }
    (2.0 * shared as f64) / ((ga.len() + gb.len()) as f64)
}

/// Similarity of two tokens in [0, 1].
/// Exact match is 1; otherwise Sorensen-Dice over boundary-padded
/// character bigrams, which forgives typical ASR slips
/// ("holmes" vs "homes").
pub fn token_similarity(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    dice(&bigrams(a), &bigrams(b))
}

/// Similarity given precomputed bigram lists (hot path of [`find_match`]).
#[inline]
fn token_similarity_pre(a: &str, ga: &[u64], b: &str, gb: &[u64]) -> f64 {
    if a == b {
        return 1.0;
    }
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    dice(ga, gb)
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

/// A document token stream with its bigram lists precomputed once, so
/// repeated matching calls skip per-token bigram construction.
#[derive(Debug, Clone, Default)]
pub struct PreparedDoc {
    tokens: Vec<String>,
    grams: Vec<Vec<u64>>,
}

impl PreparedDoc {
    pub fn new(doc_tokens: &[String]) -> PreparedDoc {
        PreparedDoc {
            tokens: doc_tokens.to_vec(),
            grams: doc_tokens.iter().map(|t| bigrams(t)).collect(),
        }
    }

    pub fn tokens(&self) -> &[String] {
        &self.tokens
    }

    pub fn len(&self) -> usize {
        self.tokens.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tokens.is_empty()
    }
}

/// Find the best window of `doc_tokens` matching `spoken_tokens`.
/// Returns `None` when nothing clears `min_score`.
pub fn find_match(doc_tokens: &[String], spoken_tokens: &[String], opts: &MatchOpts) -> Option<MatchResult> {
    find_match_prepared(&PreparedDoc::new(doc_tokens), spoken_tokens, opts)
}

/// [`find_match`] against a [`PreparedDoc`] (the hot path).
pub fn find_match_prepared(doc: &PreparedDoc, spoken_tokens: &[String], opts: &MatchOpts) -> Option<MatchResult> {
    let doc_tokens = &doc.tokens;
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

    let spoken_grams: Vec<Vec<u64>> = spoken_tokens.iter().map(|t| bigrams(t)).collect();

    // ---- Pruned search, output-identical to the JS reference. ----
    //
    // The JS engine scans windows ascending, keeps the first window with a
    // strictly maximal biased score, and bails a window once even a perfect
    // tail plus max bonus cannot beat the current best. The result is
    // therefore exactly: (max biased score, earliest start among equals),
    // reported with that window's raw score.
    //
    // We compute the same result faster: precompute the two anchor
    // similarities for every position, evaluate the window with the highest
    // upper bound first (a strong best makes bounds sharp), then sweep all
    // windows ascending, skipping any whose upper bound is strictly below
    // the best. Skipping is conservative (bound >= true biased score) and
    // ties are resolved to the earliest start explicitly, so the chosen
    // window — and its raw f64 score, accumulated in the same order — is
    // identical to the reference scan.

    let last = n - m; // maximum window start (inclusive)

    // Anchor similarity caches.
    let sim_at = |i: usize, j: usize| -> f64 {
        token_similarity_pre(&spoken_tokens[i], &spoken_grams[i], &doc_tokens[j], &doc.grams[j])
    };
    let s_first: Vec<f64> = (0..=last).map(|s| sim_at(0, s)).collect();
    let s_last: Vec<f64> = if m >= 2 {
        (0..=last).map(|s| sim_at(m - 1, s + m - 1)).collect()
    } else {
        Vec::new()
    };
    // Sum of interior weights (each interior similarity is at most 1).
    let interior_weight: f64 = if m >= 2 { weights[1..m - 1].iter().sum() } else { 0.0 };

    // Upper bound on the biased score of window s.
    let upper = |s: usize| -> f64 {
        let anchors = if m >= 2 {
            weights[0] * s_first[s] + weights[m - 1] * s_last[s]
        } else {
            weights[0] * s_first[s]
        };
        (anchors + interior_weight) / weight_sum + opts.proximity_bonus
    };

    // Biased score of window s (same accumulation order as the reference:
    // acc summed left to right, then divided, then the bonus added).
    // `floor` is the current best biased score for the conservative bail:
    // strictly-below-floor windows can neither win nor tie-earlier.
    let eval = |s: usize, floor: Option<f64>| -> Option<(f64, f64)> {
        let mut acc = 0.0f64;
        let mut remaining = weight_sum;
        for i in 0..m {
            acc += weights[i] * sim_at(i, s + i);
            remaining -= weights[i];
            if let Some(f) = floor {
                if (acc + remaining) / weight_sum + opts.proximity_bonus < f {
                    return None;
                }
            }
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
        Some((raw, score))
    };

    // Probe: the window with the highest upper bound (earliest on ties).
    let mut probe = 0usize;
    let mut probe_ub = upper(0);
    for s in 1..=last {
        let ub = upper(s);
        if ub > probe_ub {
            probe = s;
            probe_ub = ub;
        }
    }
    let (probe_raw, probe_score) = eval(probe, None).expect("unbounded eval always completes");

    struct Best {
        start: usize,
        score: f64,
        raw: f64,
    }
    let mut best = Best {
        start: probe,
        score: probe_score,
        raw: probe_raw,
    };

    for s in 0..=last {
        if s == probe {
            continue;
        }
        // Epsilon slack: `upper` sums in a different order than `eval`'s
        // accumulator, so guard against an ulp of rounding skew before
        // skipping. Real losses are far below the bound, so pruning power
        // is unaffected.
        if upper(s) + 1e-9 < best.score {
            continue;
        }
        if let Some((raw, score)) = eval(s, Some(best.score)) {
            if score > best.score || (score == best.score && s < best.start) {
                best = Best { start: s, score, raw };
            }
        }
    }

    if !(best.raw < opts.min_score) {
        Some(MatchResult {
            start: best.start,
            end: best.start + m - 1,
            score: best.raw,
        })
    } else {
        None
    }
}

/// Convenience for the live path: match the last `window_size` words of a
/// running transcript against the document.
pub fn match_transcript(doc_tokens: &[String], transcript: &str, opts: &MatchOpts) -> Option<MatchResult> {
    match_transcript_prepared(&PreparedDoc::new(doc_tokens), transcript, opts)
}

/// [`match_transcript`] against a [`PreparedDoc`] (the hot path).
pub fn match_transcript_prepared(doc: &PreparedDoc, transcript: &str, opts: &MatchOpts) -> Option<MatchResult> {
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
    find_match_prepared(doc, spoken, opts)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Literal port of the reference JS scan (no pruning beyond the JS
    /// bail): ascending windows, strict-improvement best. Used to verify
    /// the pruned production search is output-identical.
    fn find_match_reference(doc_tokens: &[String], spoken_tokens: &[String], opts: &MatchOpts) -> Option<MatchResult> {
        let n = doc_tokens.len();
        let m = spoken_tokens.len();
        if m == 0 || n == 0 || m > n {
            return None;
        }
        let mut weights = vec![1.0f64; m];
        if m >= 2 {
            weights[0] = opts.anchor_weight;
            weights[m - 1] = opts.anchor_weight;
        }
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

    #[test]
    fn pruned_search_identical_to_reference_scan() {
        // Deterministic LCG-driven fuzz: random docs (with deliberate
        // repeats and near-misses), random spoken windows, random opts.
        let mut state: u64 = 0x243F6A8885A308D3;
        let mut rand = move |bound: usize| -> usize {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            ((state >> 33) as usize) % bound.max(1)
        };
        const WORDS: [&str; 12] = [
            "one", "two", "three", "holmes", "homes", "mantelpiece", "a", "ab", "river", "rivers",
            "degree", "medicine",
        ];
        for case in 0..500 {
            let n = 1 + rand(60);
            let doc: Vec<String> = (0..n).map(|_| WORDS[rand(12)].to_owned()).collect();
            let m = 1 + rand(10);
            let spoken: Vec<String> = (0..m)
                .map(|i| {
                    // Half the time, copy from the doc to force repeats/ties.
                    if rand(2) == 0 && m <= n {
                        doc[(rand(n.saturating_sub(m) + 1) + i).min(n - 1)].clone()
                    } else {
                        WORDS[rand(12)].to_owned()
                    }
                })
                .collect();
            let opts = MatchOpts {
                min_score: 0.0, // compare full outputs, not just confident ones
                last_index: if rand(2) == 0 { Some(rand(n) as i64) } else { None },
                ..MatchOpts::default()
            };
            let fast = find_match(&doc, &spoken, &opts);
            let slow = find_match_reference(&doc, &spoken, &opts);
            match (fast, slow) {
                (None, None) => {}
                (Some(f), Some(s)) => {
                    assert_eq!((f.start, f.end), (s.start, s.end), "case {case}: window drift");
                    assert!(
                        f.score == s.score,
                        "case {case}: score drift {} vs {}",
                        f.score,
                        s.score
                    );
                }
                (f, s) => panic!("case {case}: presence drift {f:?} vs {s:?}"),
            }
        }
    }

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
        // Boundary-padded bigrams: single chars share no grams; a prefix
        // shares its opening boundary gram (JS parity).
        assert_eq!(token_similarity("a", "b"), 0.0);
        assert_eq!(token_similarity("a", "ab"), 0.4);
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
