import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect } from 'react';

/**
 * 画面の上に重ねるダイアログの枠。スマホでは下から出るシート、パソコンでは中央のカードになる。
 * 背景を押すか Esc で閉じ、開いているあいだは後ろのページをスクロールさせない
 */
export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface shadow-2xl sm:max-w-xl sm:rounded-3xl"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }}
          >
            <button
              autoFocus
              aria-label="閉じる"
              onClick={onClose}
              className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
            >
              <X className="size-4" />
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
