/**
 * Small, dependency-free HTML → blocks cleaner. Isomorphic on purpose: paste
 * handling must run in the browser too, so this does not use jsdom or
 * DOMParser. It understands block-level structure well enough to keep
 * paragraphs, headings, list items, quotes and code apart, and strips
 * everything else.
 */
const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
    hellip: "…",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
    copy: "©",
    reg: "®",
    trade: "™",
};
export function decodeEntities(s) {
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
        if (body.startsWith("#x") || body.startsWith("#X")) {
            const code = parseInt(body.slice(2), 16);
            return Number.isNaN(code) ? m : String.fromCodePoint(code);
        }
        if (body.startsWith("#")) {
            const code = parseInt(body.slice(1), 10);
            return Number.isNaN(code) ? m : String.fromCodePoint(code);
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? m;
    });
}
const BLOCK_END = {
    p: "paragraph",
    div: "paragraph",
    section: "paragraph",
    article: "paragraph",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
    li: "list-item",
    blockquote: "quote",
    pre: "code",
    td: "paragraph",
    tr: "paragraph",
    figcaption: "paragraph",
};
const DROP_CONTENT = new Set(["script", "style", "noscript", "template", "head", "iframe", "svg"]);
/**
 * Turn an HTML string into draft blocks. Tags are stripped; block boundaries
 * become block splits; entities are decoded; script/style content is dropped.
 */
export function htmlToBlocks(html) {
    let title;
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (titleMatch) {
        const t = decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim();
        if (t)
            title = t;
    }
    const drafts = [];
    let current = "";
    let currentKind = "paragraph";
    let currentLocator;
    let dropDepthTag = null;
    let dropDepth = 0;
    let inPre = false;
    const flush = () => {
        const text = inPre ? current.replace(/^\n+|\s+$/g, "") : current.replace(/\s+/g, " ").trim();
        if (text) {
            const d = { text, kind: currentKind };
            if (currentLocator)
                d.locator = currentLocator;
            drafts.push(d);
        }
        current = "";
        currentKind = "paragraph";
        currentLocator = undefined;
    };
    const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
    let last = 0;
    let m;
    while ((m = tagRe.exec(html)) !== null) {
        const textChunk = html.slice(last, m.index);
        last = tagRe.lastIndex;
        if (dropDepthTag === null && textChunk) {
            current += decodeEntities(textChunk);
        }
        const name = m[1]?.toLowerCase();
        if (!name)
            continue; // comment / doctype / cdata
        const isClose = m[0].startsWith("</");
        const isSelfClose = /\/>$/.test(m[0]);
        if (dropDepthTag !== null) {
            if (name === dropDepthTag) {
                if (isClose) {
                    dropDepth--;
                    if (dropDepth <= 0)
                        dropDepthTag = null;
                }
                else if (!isSelfClose) {
                    dropDepth++;
                }
            }
            continue;
        }
        if (!isClose && DROP_CONTENT.has(name)) {
            if (!isSelfClose) {
                dropDepthTag = name;
                dropDepth = 1;
            }
            continue;
        }
        if (name === "br") {
            current += inPre ? "\n" : " ";
            continue;
        }
        if (name === "pre") {
            if (!isClose) {
                flush();
                inPre = true;
                currentKind = "code";
            }
            else {
                currentKind = "code";
                flush();
                inPre = false;
            }
            continue;
        }
        const kind = BLOCK_END[name];
        if (kind) {
            if (!isClose) {
                // opening a block element: whatever text we have is its own block
                flush();
                if (/^h[1-6]$/.test(name))
                    currentLocator = name;
            }
            else {
                currentKind = kind;
                if (/^h[1-6]$/.test(name))
                    currentLocator = name;
                flush();
            }
        }
    }
    if (dropDepthTag === null && last < html.length) {
        current += decodeEntities(html.slice(last));
    }
    flush();
    return { drafts, title };
}
