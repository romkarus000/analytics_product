import type { SelectHTMLAttributes } from "react";

import styles from "./Select.module.css";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  helperText?: string;
};

const Select = ({ helperText, className = "", ...props }: SelectProps) => {
  return (
    <div className={styles.wrapper}>
      <select {...props} className={`${styles.select} ${className}`.trim()} />
      {helperText ? <span className={styles.helper}>{helperText}</span> : null}
    </div>
  );
};

export default Select;
