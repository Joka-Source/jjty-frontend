/**
 * Spoken mathematics -> LaTeX, rule-based v0.
 *
 * Scope (see docs/SPEECH_TO_LATEX_SCOPE.md): numbers, fractions, powers,
 * integrals, Greek letters, roots, and basic operators. No ML, no training,
 * no external data — pure rules over the recognizer transcript.
 *
 * Isomorphic: pure functions only.
 */
import { normalize } from "../fuzzy.js";
const ONES = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19,
};
const TENS = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90,
};
const SCALES = { hundred: 100, thousand: 1000, million: 1e6 };
const GREEK = new Set([
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
    "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma", "tau",
    "upsilon", "phi", "chi", "psi", "omega",
]);
/** Ordinal denominators for spoken fractions ("three fourths"). */
const ORDINAL_DENOM = {
    half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4,
    fourth: 4, fourths: 4, fifth: 5, fifths: 5, sixth: 6, sixths: 6,
    seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9,
    tenth: 10, tenths: 10,
};
const OPERATORS = {
    plus: "+", minus: "-", times: "\\times", into: "\\times", over: "/",
    equals: "=", equal: "=", "less": "<", "greater": ">",
};
const VARIABLES = new Set("abcdefghijklmnopqrstuvwxyz".split(""));
function words(s) {
    return normalize(s).split(" ").filter(Boolean);
}
/** Try to consume a spoken number at position i. Returns [value, nextIndex] or null. */
function parseNumber(w, i) {
    let total = 0;
    let current = 0;
    let consumed = 0;
    let j = i;
    while (j < w.length) {
        const t = w[j];
        if (/^\d+(\.\d+)?$/.test(t)) {
            if (consumed > 0)
                break;
            return [parseFloat(t), j + 1];
        }
        if (t in ONES) {
            current += ONES[t];
        }
        else if (t in TENS) {
            current += TENS[t];
        }
        else if (t in SCALES) {
            if (current === 0)
                current = 1;
            current *= SCALES[t];
            if (SCALES[t] >= 1000) {
                total += current;
                current = 0;
            }
        }
        else if (t === "and" && consumed > 0 && j + 1 < w.length && (w[j + 1] in ONES || w[j + 1] in TENS)) {
            // "one hundred and five"
        }
        else {
            break;
        }
        consumed++;
        j++;
    }
    if (consumed === 0)
        return null;
    return [total + current, j];
}
/** One parsed atom of the expression. */
function parseAtom(w, i) {
    // sqrt: "square root of X" / "root X"
    if (w[i] === "square" && w[i + 1] === "root") {
        let j = i + 2;
        if (w[j] === "of")
            j++;
        const inner = parseAtom(w, j);
        if (inner)
            return [`\\sqrt{${inner[0]}}`, inner[1]];
    }
    // integral: "integral from a to b of <expr> d x" | "integral of <expr>"
    if (w[i] === "integral") {
        let j = i + 1;
        let lower = null;
        let upper = null;
        if (w[j] === "from") {
            const lo = parseAtom(w, j + 1);
            if (lo) {
                lower = lo[0];
                j = lo[1];
                if (w[j] === "to") {
                    const hi = parseAtom(w, j + 1);
                    if (hi) {
                        upper = hi[0];
                        j = hi[1];
                    }
                }
            }
        }
        if (w[j] === "of")
            j++;
        // body: parse expression until "d x" (spoken "d x" / "dee x") or end
        const bodyParts = [];
        let dvar = "x";
        while (j < w.length) {
            if ((w[j] === "d" || w[j] === "dee") && w[j + 1] && VARIABLES.has(w[j + 1])) {
                dvar = w[j + 1];
                j += 2;
                break;
            }
            if (w[j] in OPERATORS && w[j] !== "over") {
                bodyParts.push(OPERATORS[w[j]]);
                j++;
                continue;
            }
            const step = parseTerm(w, j);
            if (!step)
                break;
            bodyParts.push(step[0]);
            j = step[1];
        }
        const sub = lower !== null ? `_{${lower}}` : "";
        const sup = upper !== null ? `^{${upper}}` : "";
        return [`\\int${sub}${sup} ${bodyParts.join(" ")} \\, d${dvar}`.replace(/\s+/g, " "), j];
    }
    // number (with spoken-fraction check: "three fourths")
    const num = parseNumber(w, i);
    if (num) {
        const [value, next] = num;
        if (w[next] && w[next] in ORDINAL_DENOM) {
            return [`\\frac{${value}}{${ORDINAL_DENOM[w[next]]}}`, next + 1];
        }
        return [String(value), next];
    }
    // greek letter
    if (w[i] && GREEK.has(w[i]))
        return [`\\${w[i]}`, i + 1];
    // plain variable
    if (w[i] && VARIABLES.has(w[i]))
        return [w[i], i + 1];
    return null;
}
/** Atom plus postfix powers: "x squared", "x cubed", "x to the power n". */
function parseTerm(w, i) {
    const atom = parseAtom(w, i);
    if (!atom)
        return null;
    let [latex, j] = atom;
    for (;;) {
        if (w[j] === "squared") {
            latex = `${latex}^{2}`;
            j++;
        }
        else if (w[j] === "cubed") {
            latex = `${latex}^{3}`;
            j++;
        }
        else if (w[j] === "to" && (w[j + 1] === "the" || w[j + 1] === "power")) {
            // "to the power n" / "to the power of n" / "to power n" / "raised to n"
            let k = j + 1;
            if (w[k] === "the")
                k++;
            if (w[k] === "power")
                k++;
            if (w[k] === "of")
                k++;
            const exp = parseAtom(w, k);
            if (!exp)
                break;
            latex = `${latex}^{${exp[0]}}`;
            j = exp[1];
        }
        else if (w[j] === "raised" && w[j + 1] === "to") {
            let k = j + 2;
            if (w[k] === "the")
                k++;
            if (w[k] === "power")
                k++;
            if (w[k] === "of")
                k++;
            const exp = parseAtom(w, k);
            if (!exp)
                break;
            latex = `${latex}^{${exp[0]}}`;
            j = exp[1];
        }
        else if (w[j] === "sub" || w[j] === "subscript") {
            const sub = parseAtom(w, j + 1);
            if (!sub)
                break;
            latex = `${latex}_{${sub[0]}}`;
            j = sub[1];
        }
        else {
            break;
        }
    }
    // "X over Y" -> fraction (binds tighter than +/-)
    if (w[j] === "over" || (w[j] === "upon" /* Indian English: "x upon y" */)) {
        const denom = parseTerm(w, j + 1);
        if (denom)
            return [`\\frac{${latex}}{${denom[0]}}`, denom[1]];
    }
    // "X by Y" is Indian English for division in speech; only accept when the
    // next token parses as a term
    if (w[j] === "by") {
        const denom = parseTerm(w, j + 1);
        if (denom)
            return [`\\frac{${latex}}{${denom[0]}}`, denom[1]];
    }
    return [latex, j];
}
/**
 * Convert a spoken-math utterance to LaTeX. Rule-based v0.
 * Unknown words are collected in `unparsed` rather than silently dropped.
 */
export function spokenMathToLatex(utterance) {
    const w = words(utterance);
    const parts = [];
    const unparsed = [];
    let i = 0;
    while (i < w.length) {
        const t = w[i];
        // multi-word operators
        if (t === "is" && w[i + 1] === "equal" && w[i + 2] === "to") {
            parts.push("=");
            i += 3;
            continue;
        }
        if (t === "less" && w[i + 1] === "than") {
            parts.push(w[i + 2] === "or" && w[i + 3] === "equal" ? "\\leq" : "<");
            i += w[i + 2] === "or" && w[i + 3] === "equal" ? (w[i + 4] === "to" ? 5 : 4) : 2;
            continue;
        }
        if (t === "greater" && w[i + 1] === "than") {
            parts.push(w[i + 2] === "or" && w[i + 3] === "equal" ? "\\geq" : ">");
            i += w[i + 2] === "or" && w[i + 3] === "equal" ? (w[i + 4] === "to" ? 5 : 4) : 2;
            continue;
        }
        if (t === "divided" && w[i + 1] === "by") {
            const denom = parseTerm(w, i + 2);
            if (denom && parts.length) {
                const numer = parts.pop();
                parts.push(`\\frac{${numer}}{${denom[0]}}`);
                i = denom[1];
                continue;
            }
        }
        if (t in OPERATORS && t !== "over") {
            parts.push(OPERATORS[t]);
            i++;
            continue;
        }
        const term = parseTerm(w, i);
        if (term) {
            parts.push(term[0]);
            i = term[1];
            continue;
        }
        unparsed.push(t);
        i++;
    }
    return { latex: parts.join(" ").replace(/\s+/g, " ").trim(), unparsed };
}
