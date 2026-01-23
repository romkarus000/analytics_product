import type { PropsWithChildren, ReactNode } from "react";

import styles from "./Tooltip.module.css";

type TooltipProps = PropsWithChildren<{
  content: ReactNode;
  disabled?: boolean;
}>;

const Tooltip = ({ content, disabled = false, children }: TooltipProps) => {
  if (disabled) {
    return <>{children}</>;
  }

  return (
    <span className={styles.wrapper}>
      {children}
      <span className={styles.tooltip}>{content}</span>
    </span>
  );
};

export default Tooltip;
