"use client";

import { useEffect } from "react";

/**
 * Fades `[data-reveal]` elements in once, as they scroll into view.
 * Anything already on screen when the page loads is shown straight away (no flash),
 * and with reduced motion or no IntersectionObserver nothing is ever hidden.
 */
export default function RevealOnScroll() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-shown", "");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );

    const fold = window.innerHeight;
    for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
      if (el.getBoundingClientRect().top < fold) el.setAttribute("data-shown", "");
      else io.observe(el);
    }
    root.classList.add("lp-reveal-ready");

    return () => {
      io.disconnect();
      root.classList.remove("lp-reveal-ready");
    };
  }, []);

  return null;
}
