/**
 * Spoken-friendly pairing codes: three short words, easy to say across a
 * room or a phone call. 64 words -> 64^3 = 262,144 codes, plenty for
 * short-lived pairing sessions on a v0 relay.
 *
 * Words chosen to be phonetically distinct, one or two syllables, and free
 * of jt's banned product vocabulary.
 */
export const WORDS = [
    "amber", "apple", "arrow", "badge", "bell", "birch", "brick", "brook",
    "cedar", "chalk", "cloud", "coral", "crane", "daisy", "delta", "ember",
    "fable", "fern", "flint", "gable", "garnet", "ginger", "grove", "harbor",
    "hazel", "iris", "ivory", "jasper", "juniper", "kite", "lantern", "lark",
    "linen", "lotus", "maple", "meadow", "mint", "noble", "oak", "olive",
    "onyx", "orchid", "otter", "pearl", "pine", "plum", "poppy", "quill",
    "raven", "ridge", "river", "robin", "rowan", "sage", "slate", "spruce",
    "summit", "thistle", "topaz", "tulip", "velvet", "walnut", "willow", "zephyr",
];
export function generatePairCode(random = Math.random) {
    const pick = () => WORDS[Math.floor(random() * WORDS.length)];
    return `${pick()}-${pick()}-${pick()}`;
}
export function isValidPairCode(code) {
    const parts = code.split("-");
    return parts.length === 3 && parts.every((p) => WORDS.includes(p));
}
