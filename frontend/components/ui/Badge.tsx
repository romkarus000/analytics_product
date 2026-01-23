import type { HTMLAttributes, PropsWithChildren } from "react";

import styles from "./Badge.module.css";

type BadgeVariant = "default" | "success" | "warning" | "info" | "muted";

type BadgeProps = PropsWithChildren<HTMLAttributes<HTMLSpanElement>> & {
  variant?: BadgeVariant;
};

const Badge = ({
  variant = "default",
  className = "",
  ...props
}: BadgeProps) => {
  return (
    <span
      {...props}
      className={`${styles.badge} ${styles[variant]} ${className}`.trim()}
    />
  );
};

export default Badge;
