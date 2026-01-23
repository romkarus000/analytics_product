import type { InputHTMLAttributes } from "react";

import styles from "./Input.module.css";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  helperText?: string;
};

const Input = ({ helperText, className = "", ...props }: InputProps) => {
  return (
    <div className={styles.wrapper}>
      <input {...props} className={`${styles.input} ${className}`.trim()} />
      {helperText ? <span className={styles.helper}>{helperText}</span> : null}
    </div>
  );
};

export default Input;
