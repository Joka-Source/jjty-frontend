// Browser binding. attach(element, field) maps an element's field motions
// onto CSS transforms via requestAnimationFrame. The physics stays headless;
// this file is the only place that touches the DOM.

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
  apply?(el: HTMLElement, motion: number | null, ripple: { x: number; y: number }): void;
  /** Include the field's live ripple displacement (element center). Default true. */
  ripple?: boolean;
}

interface Entry {
  el: HTMLElement;
  id: string;
  axis: "x" | "y";
  ripple: boolean;
  apply?: AttachOptions["apply"];
}

interface Driver {
  raf: number;
  entries: Set<Entry>;
}

const drivers = new WeakMap<Surface, Driver>();
let nextId = 0;
const ZERO = Object.freeze({ x: 0, y: 0 });

export function attach(element: HTMLElement, field: Surface, opts: AttachOptions = {}): Attachment {
  const id = opts.id ?? `jtw-${nextId++}`;
  let driver = drivers.get(field);
  if (!driver) {
    const d: Driver = { raf: 0, entries: new Set() };
    drivers.set(field, d);
    driver = d;
    let last = performance.now();
    const tick = (ts: number) => {
      const dt = Math.min(Math.max(ts - last, 0) / 1000, 1 / 20); // clamp tab-switch jumps
      last = ts;
      field.step(dt);
      for (const e of d.entries) {
        const s = field.sample(e.id);
        let ripple: { x: number; y: number } = ZERO;
        if (e.ripple) {
          const rect = e.el.getBoundingClientRect();
          ripple = field.rippleOffset({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        }
        if (e.apply) {
          e.apply(e.el, s ? s.x : null, ripple);
        } else {
          const mx = e.axis === "x" && s ? s.x : 0;
          const my = e.axis === "y" && s ? s.x : 0;
          e.el.style.transform = `translate(${(ripple.x + mx).toFixed(2)}px, ${(ripple.y + my).toFixed(2)}px)`;
        }
      }
      d.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
  }
  const entry: Entry = {
    el: element,
    id,
    axis: opts.axis ?? "y",
    ripple: opts.ripple ?? true,
    apply: opts.apply,
  };
  driver.entries.add(entry);
  return {
    id,
    detach() {
      const d = drivers.get(field);
      if (!d) return;
      d.entries.delete(entry);
      if (d.entries.size === 0) {
        cancelAnimationFrame(d.raf);
        drivers.delete(field);
      }
    },
  };
}
