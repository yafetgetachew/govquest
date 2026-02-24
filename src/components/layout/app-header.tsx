"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

import { SessionControls } from "@/components/auth/session-controls";
import {
  clearWordmarkTransitionSnapshot,
  readWordmarkTransitionSnapshot,
} from "@/components/layout/wordmark-transition";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { TransitionLink } from "@/components/ui/transition-link";

export function AppHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  useLayoutEffect(() => {
    if (isHome) {
      return;
    }

    const snapshot = readWordmarkTransitionSnapshot();
    const target = document.querySelector<HTMLElement>("[data-gvt-wordmark-header='true']");
    if (!target) {
      return;
    }

    if (!snapshot) {
      return;
    }

    if (Date.now() - snapshot.at > 45000) {
      clearWordmarkTransitionSnapshot();
      return;
    }

    const targetRect = target.getBoundingClientRect();
    if (snapshot.width <= 0 || snapshot.height <= 0 || targetRect.width <= 0 || targetRect.height <= 0) {
      return;
    }

    const overlay = target.cloneNode(true) as HTMLElement;
    overlay.classList.add("gvt-wordmark-fly");
    overlay.removeAttribute("data-gvt-wordmark-header");
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.left = `${targetRect.left}px`;
    overlay.style.top = `${targetRect.top}px`;
    overlay.style.width = `${targetRect.width}px`;
    overlay.style.height = `${targetRect.height}px`;
    overlay.style.opacity = "1";
    overlay.style.transform = `translate3d(${snapshot.left - targetRect.left}px, ${snapshot.top - targetRect.top}px, 0) scale(${snapshot.width / targetRect.width}, ${snapshot.height / targetRect.height})`;

    target.style.opacity = "0";
    document.body.appendChild(overlay);

    const animation = overlay.animate(
      [
        {
          transform: overlay.style.transform,
          opacity: 1,
        },
        {
          transform: "translate3d(0, 0, 0) scale(1, 1)",
          opacity: 1,
        },
      ],
      {
        duration: 360,
        easing: "cubic-bezier(0.16, 0.84, 0.32, 1)",
        fill: "forwards",
      },
    );

    let cleaned = false;
    let finished = false;

    const cleanup = (markFinished: boolean) => {
      if (cleaned) {
        return;
      }

      if (markFinished) {
        finished = true;
      }

      cleaned = true;
      target.style.opacity = "1";
      overlay.remove();

      if (finished) {
        clearWordmarkTransitionSnapshot();
        animateWordmarkSettle(target);
      }
    };

    animation.finished
      .then(() => cleanup(true))
      .catch(() => cleanup(false));

    return () => {
      animation.cancel();
      cleanup(false);
    };
  }, [isHome, pathname]);

  return (
    <header className="w-full px-3 pb-2 pt-4 sm:px-6 sm:pb-3 sm:pt-6 lg:px-10">
      <div className={`flex items-center gap-2 sm:gap-4 ${isHome ? "justify-end" : "justify-between"}`}>
        {!isHome ? (
          <TransitionLink
            href="/"
            data-gvt-wordmark-header="true"
            className="gvt-wordmark gvt-wordmark-anchor shrink-0 text-base font-black leading-none tracking-tight sm:text-xl md:text-2xl"
          >
            GovQuest
          </TransitionLink>
        ) : null}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <SessionControls />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function animateWordmarkSettle(target: HTMLElement) {
  target.animate(
    [
      { transform: "perspective(920px) rotateY(0deg)" },
      { transform: "perspective(920px) rotateY(92deg)" },
      { transform: "perspective(920px) rotateY(180deg)" },
      { transform: "perspective(920px) rotateY(268deg)" },
      { transform: "perspective(920px) rotateY(360deg)" },
    ],
    {
      duration: 480,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "none",
    },
  );
}
