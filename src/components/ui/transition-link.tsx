"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition } from "react";
import type { ComponentProps, MouseEvent } from "react";

import { writeWordmarkTransitionSnapshot } from "@/components/layout/wordmark-transition";

interface TransitionLinkProps extends Omit<ComponentProps<typeof Link>, "href"> {
  href: string;
  withViewTransition?: boolean;
}

export function TransitionLink({
  href,
  withViewTransition = false,
  onClick,
  replace,
  scroll,
  target,
  ...props
}: TransitionLinkProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (href === pathname || !href.startsWith("/")) {
      return;
    }

    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    if (target && target !== "_self") {
      return;
    }

    if (pathname === "/" && href !== "/") {
      const homeWordmark = document.querySelector<HTMLElement>("[data-gvt-wordmark-home='true']");

      if (homeWordmark) {
        const rect = homeWordmark.getBoundingClientRect();

        writeWordmarkTransitionSnapshot({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          at: Date.now(),
        });
      }
    }

    const navigate = () => {
      startTransition(() => {
        if (replace) {
          router.replace(href, { scroll });
        } else {
          router.push(href, { scroll });
        }
      });
    };

    const startViewTransition = document.startViewTransition?.bind(document);

    event.preventDefault();

    if (!startViewTransition || !withViewTransition) {
      navigate();
      return;
    }

    startViewTransition(() => navigate());
  };

  return (
    <Link
      href={href}
      replace={replace}
      scroll={scroll}
      target={target}
      onClick={handleClick}
      {...props}
    />
  );
}
