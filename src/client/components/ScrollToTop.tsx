import { ArrowUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

/** これだけスクロールしたらボタンを出す(px) */
const SHOW_AFTER_PX = 600;

/** 長いリストで、右下からページの先頭に戻るボタン */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          onClick={() =>
            window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
          }
          aria-label="ページの先頭へ戻る"
          title="ページの先頭へ戻る"
          // 画面下端に安全領域(iPhone のホームバーなど)があるときは、そのぶん上げる
          className="fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 grid size-12 place-items-center rounded-full border border-line bg-surface/90 text-ink shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)] backdrop-blur transition-colors hover:bg-surface sm:right-6 sm:bottom-6"
        >
          <ArrowUp className="size-5" aria-hidden />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
