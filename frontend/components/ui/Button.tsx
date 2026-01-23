import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

type ButtonSize = "md" | "sm";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement>
> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const Button = ({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) => {
  return (
    <button
      {...props}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`.trim()}
    />
  );
};

export default Button;
