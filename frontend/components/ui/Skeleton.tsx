import type { HTMLAttributes } from "react";

import styles from "./Skeleton.module.css";

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  height?: number | string;
  width?: number | string;
};

const Skeleton = ({ height = 16, width = "100%", style, ...props }: SkeletonProps) => {
  return (
    <div
      {...props}
      className={styles.skeleton}
      style={{ height, width, ...style }}
    />
  );
};

export default Skeleton;
