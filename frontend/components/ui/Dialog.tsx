import type { PropsWithChildren, ReactNode } from "react";

import styles from "./Dialog.module.css";

type DialogProps = PropsWithChildren<{
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
}>;

const Dialog = ({
  open,
  title,
  description,
  onClose,
  footer,
  children,
}: DialogProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.content}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
};

export default Dialog;
