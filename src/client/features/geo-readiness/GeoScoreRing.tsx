import { useId } from "react";
import { cn } from "cn";

/** Score bands shared by the ring, the category tiles and the summary copy. */
export function scoreTone(score: number) {
  if (score >= 80) return { color: "var(--sys-green)", label: "Excellent" };
  if (score >= 60) return { color: "var(--sys-teal)", label: "Good" };
  if (score >= 40) return { color: "var(--sys-orange)", label: "Needs work" };
  return { color: "var(--sys-red)", label: "Poor" };
}

/**
 * An Activity-style ring: a translucent track with a rounded, gradient arc
 * that fills to the score.
 */
export function GeoScoreRing({
  score,
  size = 168,
  stroke = 16,
  className,
  children,
}: {
  score: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const gradientId = useId();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const { color } = scoreTone(clamped);

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.75" />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeOpacity={0.16}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-(--duration-slow) ease-(--ease-spring) starting:[stroke-dashoffset:var(--ring-empty)]"
          style={{ ["--ring-empty" as string]: circumference }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children}
      </div>
    </div>
  );
}
