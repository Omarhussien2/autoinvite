import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const FAQ = () => {
  const faqs = [
    {
      q: "هل حسابي على واتساب في أمان؟",
      a: "نعم، وهذا أولويتنا الأولى. يعتمد أوتو إنفايت على تقنية 'التمهل الذكي' التي تحاكي نمط الإرسال البشري الطبيعي بفواصل زمنية متغيرة ومدروسة، بدلاً من الإرسال الآلي المتسارع الذي يؤدي إلى الحظر. آلاف الحملات أُرسلت عبر منصتنا بأمان تام."
    },
    {
      q: "هل يمكنني إرسال دعوات شخصية باسم كل ضيف؟",
      a: "بالتأكيد. هذه إحدى أقوى ميزات أوتو إنفايت. ارفع ملف الأسماء، ضع التصميم الأساسي، وحدد مكان الاسم — وسيتولى النظام توليد كل دعوة باسم صاحبها وإرسالها تلقائياً. لا تكرار، لا أخطاء."
    },
    {
      q: "هل أحتاج خبرة تقنية للبدء؟",
      a: "لا. صُمّمت المنصة لأصحاب الأعمال والمسوّقين، وليس للمطورين. أربع خطوات واضحة — رفع البيانات، اختيار القالب، ضبط الإعدادات، والإرسال. معظم عملائنا أطلقوا حملتهم الأولى خلال 10 دقائق."
    }
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-32 px-6 md:px-12 lg:px-24 border-t border-zinc-800/50 bg-zinc-900/20">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-zinc-100 mb-16 tracking-tight">
          الأسئلة الشائعة
        </h2>

        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
            <div 
              key={index} 
              className={`border border-zinc-800 rounded-2xl overflow-hidden transition-colors duration-300 ${isOpen ? 'bg-bg-card' : 'bg-transparent hover:bg-zinc-900/50'}`}
            >
              <button
                className="w-full text-right px-8 py-6 flex justify-between items-center focus:outline-none"
                onClick={() => setOpenIndex(isOpen ? null : index)}
              >
                <span className="text-xl font-bold text-zinc-200">{faq.q}</span>
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  className={isOpen ? 'text-digital-teal' : 'text-zinc-500'}
                >
                  <ChevronDown size={24} />
                </motion.div>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3, delay: 0.05 }}
                      className="px-8 pb-6"
                    >
                      <p className="text-lg text-zinc-400 leading-relaxed border-t border-zinc-800 pt-4">
                        {faq.a}
                      </p>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )})}
        </div>
      </div>
    </section>
  );
};
