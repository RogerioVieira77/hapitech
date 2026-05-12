import * as React from "react";
import { cn } from "@/lib/utils";

type ThemedIconProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  invertInDark?: boolean;
};

export function ThemedIcon({ className, invertInDark = true, ...props }: ThemedIconProps) {
  return (
    <img
      {...props}
      draggable={false}
      className={cn(
        "object-contain select-none",
        invertInDark && "dark:brightness-0 dark:invert dark:contrast-125",
        className,
      )}
    />
  );
}
