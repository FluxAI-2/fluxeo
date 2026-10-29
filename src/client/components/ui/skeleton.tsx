import { cn } from "cn";

// bg-muted is the page background in the light theme, so a muted skeleton
// would not show outside a card. A foreground tint shows on both surfaces.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-fill-tertiary", className)}
      {...props}
    />
  );
}

export { Skeleton };
