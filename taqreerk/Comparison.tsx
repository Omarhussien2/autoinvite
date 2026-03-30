import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, XCircle, AlertTriangle, Clock, Shield, Zap, DollarSign } from 'lucide-react';

export const Comparison = () => {
  const rows = [
    {
      icon: <Clock className="w-5 h-5 text-zinc-400" />,
      label: "الوقت المستغرق",
      autoInvite: { title: "دقائق معدودة", desc: "جاهز للإرسال فوراً" },
      platforms: { title: "أسابيع للإعداد", desc: "تصميم، ربط، واختبار" },
      manual: { title: "مجهود لا نهائي", desc: "عمل يدوي بحت" }
    },
    {
      icon: <Shield className="w-5 h-5 text-zinc-400" />,
      label: "أمان الحساب",
      autoInvite: { title: "حماية 99%", desc: "تمهل ذكي يحاكي البشر" },
      platforms: { title: "خطر حظر مرتفع", desc: "إرسال آلي عشوائي" },
      manual: { title: "آمن لكن بطيء", desc: "لا يمكن التوسع فيه" }
    },
    {
      icon: <Zap className="w-5 h-5 text-zinc-400" />,
      label: "الجهد المطلوب",
      autoInvite: { title: "مؤتمت بالكامل", desc: "تنظيف، تصميم، إرسال" },
      platforms: { title: "خبرة تقنية", desc: "لإدارة الحملات المعقدة" },
      manual: { title: "نسخ ولصق", desc: "مجهود بشري هائل" }
    },
    {
      icon: <DollarSign className="w-5 h-5 text-zinc-400" />,
      label: "التكلفة",
      autoInvite: { title: "منخفضة (44 ريال)", desc: "تكلفة ثابتة وواضحة" },
      platforms: { title: "باهظة", desc: "اشتراكات شهرية معقدة" },
      manual: { title: "مخفية", desc: "وقتك الثمين الضائع" }
    }
  ];

  return (
    <section className="py-32 px-6 md:px-12 lg:px-24 border-t border-zinc-800/50 relative overflow-hidden bg-bg-dark">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-digital-teal/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-20">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-6xl font-bold text-zinc-100 mb-6 tracking-tight"
          >
            لماذا أوتو انفيت؟ <br />
            <span className="text-zinc-500">مقارنة مع البدائل</span>
          </motion.h2>
        </div>

        <div className="w-full overflow-x-auto pb-12 pt-6 hide-scrollbar">
          <div className="min-w-[900px] flex flex-col border border-zinc-800 rounded-3xl bg-zinc-900/40 backdrop-blur-sm relative shadow-2xl">
            
            {/* Header Row */}
            <div className="grid grid-cols-4 items-end">
              <div className="col-span-1 p-8"></div>
              
              {/* Auto Invite Header */}
              <div className="col-span-1 bg-gradient-to-b from-digital-teal to-emerald-700 text-white p-8 rounded-t-3xl relative -mt-6 shadow-[0_-10px_30px_rgba(16,185,129,0.2)] flex flex-col justify-end z-20 border-t border-x border-emerald-500/50">
                <div className="w-12 h-12 mb-4 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md shadow-inner">
                  <Zap className="text-white w-6 h-6" fill="currentColor" />
                </div>
                <h3 className="text-2xl font-bold">أوتو انفيت</h3>
                <div className="absolute -bottom-px left-0 right-0 h-px bg-emerald-600"></div>
              </div>

              <div className="col-span-1 p-8 border-b border-zinc-800/50">
                <h3 className="text-xl font-bold text-zinc-100">منصات التسويق</h3>
              </div>
              <div className="col-span-1 p-8 border-b border-zinc-800/50">
                <h3 className="text-xl font-bold text-zinc-100">العمل اليدوي</h3>
                <span className="text-sm font-normal text-zinc-500">الوضع الحالي</span>
              </div>
            </div>

            {/* Data Rows */}
            {rows.map((row, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className={`grid grid-cols-4 group transition-colors duration-300 hover:bg-zinc-800/60 ${idx === rows.length - 1 ? '' : 'border-b border-zinc-800/50'}`}
              >
                {/* Label */}
                <div className="col-span-1 p-8 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 group-hover:bg-zinc-700 transition-all duration-300 shadow-inner shrink-0">
                    {row.icon}
                  </div>
                  <span className="text-lg font-bold text-zinc-100">{row.label}</span>
                </div>

                {/* Auto Invite Cell */}
                <div className={`col-span-1 p-8 relative z-10 flex flex-col justify-center transition-colors duration-300 ${idx === rows.length - 1 ? 'rounded-b-3xl' : ''} bg-digital-teal/10 border-x border-digital-teal/20 group-hover:bg-digital-teal/20`}>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-5 h-5 text-digital-teal shrink-0" />
                    <span className="font-bold text-lg text-digital-teal">{row.autoInvite.title}</span>
                  </div>
                  <span className="text-zinc-300 text-sm mr-7">{row.autoInvite.desc}</span>
                </div>

                {/* Platforms Cell */}
                <div className="col-span-1 p-8 flex flex-col justify-center transition-colors duration-300">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="w-5 h-5 text-red-400/70 shrink-0" />
                    <span className="font-bold text-zinc-300">{row.platforms.title}</span>
                  </div>
                  <span className="text-zinc-500 text-sm mr-7">{row.platforms.desc}</span>
                </div>

                {/* Manual Cell */}
                <div className="col-span-1 p-8 flex flex-col justify-center transition-colors duration-300">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-5 h-5 text-yellow-500/70 shrink-0" />
                    <span className="font-bold text-zinc-300">{row.manual.title}</span>
                  </div>
                  <span className="text-zinc-500 text-sm mr-7">{row.manual.desc}</span>
                </div>
              </motion.div>
            ))}

          </div>
        </div>
      </div>
    </section>
  );
};

