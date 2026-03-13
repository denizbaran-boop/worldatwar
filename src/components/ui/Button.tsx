import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
};

export function Button({ children, className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={clsx(
        "rounded-md border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "border-cyan-500 bg-cyan-600 text-white hover:bg-cyan-500",
        variant === "secondary" && "border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700",
        variant === "danger" && "border-rose-600 bg-rose-700 text-white hover:bg-rose-600",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
