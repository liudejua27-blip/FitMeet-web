import { motion } from 'framer-motion';

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: 'left' | 'center';
};

export function SectionHeading({ eyebrow, title, body, align = 'left' }: SectionHeadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-14%' }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}
    >
      {eyebrow && (
        <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.34em] text-[#b8b5ac]/58">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-[clamp(2.15rem,5vw,5.3rem)] font-light leading-[0.98] tracking-[-0.045em] text-[#f4efe6]">
        {title}
      </h2>
      {body && (
        <p className="mt-7 text-balance text-[clamp(1rem,1.5vw,1.25rem)] leading-8 text-[#f4efe6]/62">
          {body}
        </p>
      )}
    </motion.div>
  );
}
