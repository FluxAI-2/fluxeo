import { useId } from "react";
import { cn } from "cn";

/**
 * The Fluxeo app icon: a squircle in the AI gradient with three flowing lines
 * that read as an "F" — search results streaming into an answer.
 */
function FluxeoMark({ className }: { className?: string }) {
  const gradientId = useId();
  const glossId = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      className={cn("size-7 shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0A84FF" />
          <stop offset="0.45" stopColor="#5E5CE6" />
          <stop offset="0.8" stopColor="#BF5AF2" />
          <stop offset="1" stopColor="#FF375F" />
        </linearGradient>
        <linearGradient id={glossId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M32 0c19.2 0 25.6 0 28.8 3.2C64 6.4 64 12.8 64 32s0 25.6-3.2 28.8C57.6 64 51.2 64 32 64S6.4 64 3.2 60.8C0 57.6 0 51.2 0 32S0 6.4 3.2 3.2C6.4 0 12.8 0 32 0Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M32 0c19.2 0 25.6 0 28.8 3.2C64 6.4 64 12.8 64 32s0 25.6-3.2 28.8C57.6 64 51.2 64 32 64S6.4 64 3.2 60.8C0 57.6 0 51.2 0 32S0 6.4 3.2 3.2C6.4 0 12.8 0 32 0Z"
        fill={`url(#${glossId})`}
      />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="5.5">
        <path d="M18 19.5c5-3.2 10.5-3.2 15.5 0s10.5 3.2 12.5 1.6" />
        <path d="M18 32c4-2.6 8.5-2.6 12.5 0s7.5 2.6 9.5 1.2" />
        <path d="M18 32v13" />
      </g>
    </svg>
  );
}

/** The mark with the wordmark beside it, for headers and auth screens. */
export function FluxeoLogo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <FluxeoMark className={markClassName} />
      <span className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-foreground">
        Fluxeo
      </span>
    </span>
  );
}
