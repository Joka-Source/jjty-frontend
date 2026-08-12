import { type Surface } from "./surface.ts";
export interface Attachment {
    /** Field id assigned to this element — use it with field.glideTo / release. */
    readonly id: string;
    /** Stop driving this element; stops the shared rAF loop when last one leaves. */
    detach(): void;
}
export interface AttachOptions {
    id?: string;
    /** Axis the element's motion value maps to. Default "y". */
    axis?: "x" | "y";
    /** Custom writer. Default: translate() on the chosen axis plus ripple offset. */
    apply?(el: HTMLElement, motion: number | null, ripple: {
        x: number;
        y: number;
    }): void;
    /** Include the field's live ripple displacement (element center). Default true. */
    ripple?: boolean;
}
export declare function attach(element: HTMLElement, field: Surface, opts?: AttachOptions): Attachment;
