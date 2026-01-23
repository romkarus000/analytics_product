import type { HTMLAttributes, PropsWithChildren } from "react";

import styles from "./Card.module.css";

type CardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  tone?: "default" | "soft" | "bordered";
};

const Card = ({ tone = "default", className = "", ...props }: CardProps) => {
  return (
    <div
      {...props}
      className={`${styles.card} ${styles[tone]} ${className}`.trim()}
    />
  );
};

export default Card;
