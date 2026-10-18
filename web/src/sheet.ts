/**
 * The phone bottom sheet (≤ 640 px): the panel's drag handle and its two snap heights, "half"
 * (max 50vh, the default) and "full" (max 90vh). Dragging the handle or the header up expands the
 * sheet, down collapses it, and down from "half" closes it (× still closes it too). The handle is a
 * real button, the keyboard and screen-reader path: it toggles half/full and says which via
 * aria-expanded. Without motion (prefers-reduced-motion), snaps happen at once.
 */
import { sheet as t } from "./strings";

const NARROW = "(max-width: 640px)";
const REDUCED = "(prefers-reduced-motion: reduce)";
/** A drag past this many px, or released faster than FLING px/ms, snaps to the next state. */
const THRESHOLD = 60;
const FLING = 0.5;
/** From "full", a drag down longer than this share of the viewport closes; a shorter one returns to "half". */
const CLOSE_FROM_FULL = 0.5;
export type SheetState = "half" | "full";

export function setSheetState(root: HTMLElement, handle: HTMLButtonElement, state: SheetState): void {
  root.dataset.sheet = state;
  handle.setAttribute("aria-expanded", String(state === "full"));
  handle.setAttribute("aria-label", state === "full" ? t.collapse : t.expand);
}

/** Wires the handle (click/keyboard toggle) and the touch/mouse drag on `zones` (the handle and the header). */
export function attachSheet(root: HTMLElement, handle: HTMLButtonElement, zones: HTMLElement[], onClose: () => void): void {
  handle.addEventListener("click", (e) => {
    if (handle.dataset.dragged) {
      delete handle.dataset.dragged; // the click that ends a drag isn't a toggle
      e.preventDefault();
      return;
    }
    setSheetState(root, handle, root.dataset.sheet === "full" ? "half" : "full");
  });

  let drag: { id: number; startY: number; startH: number; dy: number; samples: [number, number][] } | null = null;
  const reset = () => {
    root.classList.remove("sheet-dragging");
    root.style.removeProperty("transform");
    root.style.removeProperty("max-height");
  };
  const close = () => {
    if (matchMedia(REDUCED).matches) return onClose();
    root.style.transform = "translateY(100%)";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onClose();
      root.style.removeProperty("transform");
    };
    root.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 300); // in case the transition doesn't run
  };

  const down = (e: PointerEvent) => {
    if (!matchMedia(NARROW).matches || drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    const button = (e.target as Element).closest("button");
    if (button && button !== handle) return; // × and the credits toggle keep their taps
    drag = { id: e.pointerId, startY: e.clientY, startH: root.getBoundingClientRect().height, dy: 0, samples: [[e.timeStamp, e.clientY]] };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = e.clientY - drag.startY;
    drag.samples = [...drag.samples.slice(-4), [e.timeStamp, e.clientY]];
    if (Math.abs(drag.dy) < 4) return;
    root.classList.add("sheet-dragging");
    if (drag.dy < 0) {
      root.style.maxHeight = `${Math.min(window.innerHeight * 0.9, drag.startH - drag.dy)}px`;
      root.style.removeProperty("transform");
    } else {
      root.style.transform = `translateY(${drag.dy}px)`;
      root.style.removeProperty("max-height");
    }
    e.preventDefault();
  };
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dy, samples } = drag;
    drag = null;
    const [[t0, y0], [t1, y1]] = [samples[0], samples[samples.length - 1]];
    const velocity = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0;
    if (Math.abs(dy) >= 4) handle.dataset.dragged = "1";
    setTimeout(() => delete handle.dataset.dragged, 0); // no click follows a drag released off the handle
    const state = root.dataset.sheet === "full" ? "full" : "half";
    reset();
    if (dy < -THRESHOLD || velocity < -FLING) setSheetState(root, handle, "full");
    else if (dy > THRESHOLD || velocity > FLING) {
      if (state === "full" && dy < window.innerHeight * CLOSE_FROM_FULL) setSheetState(root, handle, "half");
      else close();
    }
  };
  for (const zone of zones) {
    zone.addEventListener("pointerdown", down);
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerup", up);
    zone.addEventListener("pointercancel", (e) => {
      if (drag?.id === e.pointerId) {
        drag = null;
        reset();
      }
    });
  }
}
