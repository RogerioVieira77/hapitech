import { motion, type Variants, type Easing } from "framer-motion";
import { ReactNode } from "react";

const ease: Easing = [0.25, 0.1, 0.25, 1];

const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3, ease }}
    >
      {children}
    </motion.div>
  );
}

export const staggerContainer: Variants = {
  animate: {
    transition: { staggerChildren: 0.06 },
  },
};

export const fadeUpItem: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease } },
};
