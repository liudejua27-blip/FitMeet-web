import { motion } from 'framer-motion';
import { heroCopy, type HeroLanguage } from '@/data/heroCopy';

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0 },
};

type HeroCopyProps = {
  currentLang: HeroLanguage;
};

export function HeroCopy({ currentLang }: HeroCopyProps) {
  const copy = heroCopy[currentLang];

  return (
    <motion.div
      className="hero-copy"
      initial="hidden"
      animate="visible"
      transition={{ staggerChildren: 0.12, delayChildren: 0.2 }}
    >
      <span className="hero-copy__coordinate" aria-hidden="true">
        <span />
      </span>
      <motion.h1 variants={fadeUp} transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }}>
        {copy.brand}
      </motion.h1>
      <motion.p
        className="hero-copy__tagline"
        variants={fadeUp}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      >
        {copy.tagline}
      </motion.p>
      <motion.p
        className="hero-copy__subtagline"
        variants={fadeUp}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      >
        {copy.subTagline}
      </motion.p>
      <motion.div
        className="hero-copy__description"
        variants={fadeUp}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <p>{copy.description}</p>
        <p>{copy.englishDescription}</p>
      </motion.div>
    </motion.div>
  );
}
