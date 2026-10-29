import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Spinner } from "@/client/components/ui/spinner";

const buttonVariants = cva(
  // Liquid Glass controls are capsules. They scale down slightly on press
  // (pressable) instead of shifting, and focus shows a soft accent halo.
  "group/button pressable inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium tracking-[-0.006em] whitespace-nowrap outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 in-data-[slot=button-group]:rounded-lg [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(0_0_0/0.12)] hover:brightness-110 active:brightness-95",
        outline:
          "bg-card text-foreground shadow-[0_0_0_0.5px_var(--input),var(--shadow-e1)] hover:bg-[color-mix(in_srgb,var(--card),var(--foreground)_4%)] aria-expanded:bg-fill-tertiary dark:bg-fill-tertiary dark:shadow-[0_0_0_0.5px_var(--input)] dark:hover:bg-fill-secondary",
        secondary:
          "bg-fill-tertiary text-foreground hover:bg-fill-secondary aria-expanded:bg-fill-secondary",
        ghost:
          "text-foreground/80 hover:bg-fill-tertiary hover:text-foreground aria-expanded:bg-fill-tertiary aria-expanded:text-foreground",
        destructive:
          "bg-destructive/12 text-destructive hover:bg-destructive/18 focus-visible:ring-destructive/25 dark:bg-destructive/20 dark:hover:bg-destructive/28",
        /** Marks an action that runs a generative-engine (AI) analysis. */
        ai: "bg-ai text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_2px_10px_rgb(88_86_214/0.35)] hover:brightness-110 active:brightness-95",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 gap-1.5 px-4",
        xs: "h-6 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-6 text-[0.9375rem]",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  pending = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Disables the button and shows a spinner before the label while a mutation runs. */
    pending?: boolean;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
