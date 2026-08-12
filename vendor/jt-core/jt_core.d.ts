/* tslint:disable */
/* eslint-disable */

export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    doc_token_count(): number;
    /**
     * Feed the rolling transcript; returns
     * `{blockIndex, confidence, tokenStart, tokenEnd}` or `null`.
     */
    match_update(transcript: string): any;
    /**
     * `blocks_json`: JSON array of document block strings, in order.
     */
    constructor(blocks_json: string);
    /**
     * Forget the previous match position (e.g. the reader jumped).
     */
    reset_position(): void;
}

/**
 * Legal next states for `state`, as a JSON array of wire names.
 */
export function cursor_legal_transitions(state: string): string;

/**
 * A fresh CursorRecord as JSON, in state "rest".
 */
export function cursor_new(id: string, anchor_id: string, source_id: string): string;

/**
 * All lifecycle wire names, as a JSON array.
 */
export function cursor_states(): string;

/**
 * Apply one legal state change; returns the updated record as JSON.
 */
export function cursor_transition(cursor_json: string, next_state: string, at?: string | null): string;

export function cursor_validate(cursor_json: string): boolean;

export function receipt_validate(receipt_json: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly cursor_legal_transitions: (a: number, b: number) => [number, number, number, number];
    readonly cursor_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly cursor_states: () => [number, number];
    readonly cursor_transition: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly cursor_validate: (a: number, b: number) => number;
    readonly engine_doc_token_count: (a: number) => number;
    readonly engine_match_update: (a: number, b: number, c: number) => any;
    readonly engine_new: (a: number, b: number) => [number, number, number];
    readonly engine_reset_position: (a: number) => void;
    readonly receipt_validate: (a: number, b: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
