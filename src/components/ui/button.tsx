import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-cyan-300/20 bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_8px_28px_rgba(0,119,255,.22)] hover:-translate-y-0.5 hover:from-blue-500 hover:to-cyan-400 hover:shadow-[0_12px_34px_rgba(0,174,255,.3)]",
        destructive:
          "border border-rose-400/30 bg-rose-500/12 text-rose-300 shadow-sm hover:bg-rose-500/22 hover:text-rose-200",
        outline:
          "border border-blue-400/35 bg-blue-950/35 text-slate-100 shadow-sm hover:border-cyan-300/60 hover:bg-blue-500/12 hover:text-white",
        secondary:
          "border border-slate-600/70 bg-slate-800/80 text-slate-100 shadow-sm hover:border-blue-400/40 hover:bg-slate-700",
        ghost: "text-slate-300 hover:bg-blue-500/12 hover:text-white",
        link: "text-cyan-400 underline-offset-4 hover:text-cyan-300 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-xl px-3 text-xs",
        lg: "h-11 rounded-xl px-7",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
