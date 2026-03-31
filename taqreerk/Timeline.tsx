import React, { useState, useRef, useEffect } from 'react';
import { motion, useInView, AnimatePresence } from 'motion/react';
import { FileSpreadsheet, Palette, Send, BarChart3, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const DataVisual = () => {
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="p-8 h-full flex flex-col justify-center bg-zinc-900/20"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-8">
          <h4 className="text-zinc-100 font-bold text-xl">تنظيف البيانات</h4>
          <span className="text-digital-teal text-sm bg-digital-teal/10 px-3 py-1 rounded-full border border-digital-teal/20 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> جاري المعالجة
          </span>
        </div>
        
        <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} transition={{delay: 0.2}} className="flex justify-between items-center p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-400">1</div>
            <span className="text-zinc-300 font-mono" dir="ltr">+966 50 123 4567</span>
          </div>
          <span className="text-digital-teal flex items-center gap-1 text-sm"><CheckCircle2 className="w-4 h-4"/> صحيح</span>
        </motion.div>

        <motion.div 
          initial={{opacity:0, x:-20}} 
          animate={{opacity:0, height:0, margin:0, padding:0, borderWidth:0}} 
          transition={{delay: 1.5, duration: 0.5}} 
          className="flex justify-between items-center p-4 bg-red-950/20 rounded-xl border border-red-900/30 overflow-hidden"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-400">2</div>
            <span className="text-zinc-500 font-mono line-through" dir="ltr">050 123 45</span>
          </div>
          <span className="text-red-400 flex items-center gap-1 text-sm"><XCircle className="w-4 h-4"/> رقم ناقص</span>
        </motion.div>

        <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} transition={{delay: 0.6}} className="flex justify-between items-center p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-400">3</div>
            <span className="text-zinc-300 font-mono" dir="ltr">+966 55 987 6543</span>
          </div>
          <span className="text-digital-teal flex items-center gap-1 text-sm"><CheckCircle2 className="w-4 h-4"/> صحيح</span>
        </motion.div>

        <motion.div 
          initial={{opacity:0, x:-20}} 
          animate={{opacity:0, height:0, margin:0, padding:0, borderWidth:0}} 
          transition={{delay: 2, duration: 0.5}} 
          className="flex justify-between items-center p-4 bg-amber-950/20 rounded-xl border border-amber-900/30 overflow-hidden"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-400">4</div>
            <span className="text-zinc-500 font-mono line-through" dir="ltr">+966 50 123 4567</span>
          </div>
          <span className="text-amber-400 flex items-center gap-1 text-sm"><XCircle className="w-4 h-4"/> مكرر</span>
        </motion.div>
      </div>
    </motion.div>
  );
};

const DesignVisual = () => {
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="p-8 h-full flex items-center justify-center bg-zinc-900/20 relative overflow-hidden"
    >
      {/* Background decorative elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-digital-teal/5 rounded-full blur-3xl" />
      
      <div className="relative w-72 h-[400px] bg-zinc-800 rounded-2xl border border-zinc-700 p-8 flex flex-col items-center justify-center text-center shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-digital-teal to-emerald-500" />
        
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
          className="w-16 h-16 rounded-full bg-zinc-700 mb-6 flex items-center justify-center"
        >
          <Palette className="w-8 h-8 text-zinc-400" />
        </motion.div>

        <h4 className="text-2xl font-bold text-zinc-100 mb-4">دعوة زفاف</h4>
        <p className="text-zinc-400 mb-8 leading-relaxed">نتشرف بدعوتكم لحضور حفل زفافنا وتناول طعام العشاء</p>
        
        <div className="w-full bg-digital-teal/10 text-digital-teal px-4 py-3 rounded-xl border border-digital-teal/30 font-bold text-lg relative overflow-hidden group">
          <motion.div 
            className="absolute inset-0 bg-digital-teal/20 translate-x-[-100%]"
            animate={{ translateX: ['-100%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.span
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            [اسم الضيف هنا]
          </motion.span>
        </div>
      </div>
    </motion.div>
  );
};

const SendingVisual = () => {
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="p-8 h-full flex flex-col justify-center bg-zinc-900/20"
    >
      <div className="mb-8">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-zinc-400">تقدم الإرسال</span>
          <span className="text-digital-teal font-mono">65%</span>
        </div>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: "0%" }} animate={{ width: "65%" }} transition={{ duration: 2, ease: "easeOut" }}
            className="h-full bg-digital-teal rounded-full"
          />
        </div>
      </div>

      <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-800 before:to-transparent">
        {[
          { name: "أحمد محمد", status: "sent", delay: 0.2 },
          { name: "سارة خالد", status: "sent", delay: 0.6 },
          { name: "محمد عبدالله", status: "sending", delay: 1.0 },
          { name: "فاطمة علي", status: "pending", delay: 1.4 },
        ].map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: msg.delay }}
            className="flex items-center gap-4 p-4 bg-zinc-800/40 rounded-xl border border-zinc-700/50 relative z-10 backdrop-blur-sm"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              msg.status === 'sent' ? 'bg-digital-teal/20 text-digital-teal' : 
              msg.status === 'sending' ? 'bg-amber-500/20 text-amber-500' : 
              'bg-zinc-700 text-zinc-400'
            }`}>
              {msg.status === 'sent' ? <CheckCircle2 className="w-5 h-5" /> : 
               msg.status === 'sending' ? <Loader2 className="w-5 h-5 animate-spin" /> : 
               <div className="w-2 h-2 rounded-full bg-zinc-400" />}
            </div>
            <div className="flex-1">
              <p className="text-zinc-200 font-medium">{msg.name}</p>
              <p className="text-xs text-zinc-500">
                {msg.status === 'sent' ? 'تم التسليم' : 
                 msg.status === 'sending' ? 'جاري الإرسال (تمهل ذكي)...' : 
                 'في الانتظار'}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

const TrackingVisual = () => {
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="p-8 h-full flex flex-col justify-center gap-8 bg-zinc-900/20"
    >
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="bg-zinc-800/40 p-6 rounded-2xl border border-zinc-700/50 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-digital-teal/10 rounded-bl-full" />
          <p className="text-zinc-400 mb-2 text-sm">تم الإرسال بنجاح</p>
          <motion.p className="text-4xl font-bold text-digital-teal font-mono" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring" }}>
            1,250
          </motion.p>
        </div>
        <div className="bg-zinc-800/40 p-6 rounded-2xl border border-zinc-700/50 text-center relative overflow-hidden">
          <p className="text-zinc-400 mb-2 text-sm">نسبة الوصول</p>
          <motion.p className="text-4xl font-bold text-zinc-100 font-mono" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", delay: 0.2 }}>
            99.8%
          </motion.p>
        </div>
      </div>
      
      <div className="bg-zinc-800/40 p-6 rounded-2xl border border-zinc-700/50">
        <h4 className="text-zinc-300 mb-6 text-sm">معدل الإرسال (آخر ساعة)</h4>
        <div className="w-full h-32 flex items-end gap-2 justify-between">
          {[40, 70, 45, 90, 65, 100, 80, 60].map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: i * 0.1, duration: 0.5, type: "spring" }}
              className="w-full bg-gradient-to-t from-digital-teal/20 to-digital-teal/60 rounded-t-sm hover:to-digital-teal transition-colors cursor-pointer"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

const visuals = [DataVisual, DesignVisual, SendingVisual, TrackingVisual];

const steps = [
  {
    title: "ارفع بياناتك",
    desc: "قم برفع ملف الإكسل الخاص بك. سيقوم النظام فوراً بتنظيف الأرقام، إزالة التكرار، وتجهيز القائمة للبدء.",
    icon: FileSpreadsheet
  },
  {
    title: "صمم دعوتك",
    desc: "ارفع تصميم الدعوة الأساسي، وحدد المكان الذي ترغب بظهور اسم الضيف فيه. النظام سيتولى دمج الأسماء تلقائياً.",
    icon: Palette
  },
  {
    title: "الإرسال الآمن",
    desc: "تبدأ عملية الإرسال باستخدام خوارزمية 'التمهل الذكي' لضمان وصول الرسائل بأمان تام وبدون حظر لحسابك.",
    icon: Send
  },
  {
    title: "تابع النتائج",
    desc: "راقب لوحة التحكم الحية لترى تقدم الإرسال، الأرقام الخاطئة، ومن تفاعل مع دعوتك في الوقت الفعلي.",
    icon: BarChart3
  }
];

export const Timeline = () => {
  return (
    <section className="py-32 px-6 md:px-12 lg:px-24 bg-bg-dark border-t border-zinc-800/50 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-24">
          <h2 className="text-4xl md:text-6xl font-bold text-zinc-100 mb-6 tracking-tight">
            من القائمة إلى الدعوة —<br />
            <span className="text-zinc-500">في 4 خطوات فقط</span>
          </h2>
        </div>

        <div className="space-y-32">
          {steps.map((step, index) => {
            const Visual = visuals[index];
            const isEven = index % 2 === 0;
            
            return (
              <div key={index} className={`flex flex-col lg:flex-row items-center gap-12 lg:gap-24 ${!isEven ? 'lg:flex-row-reverse' : ''}`}>
                
                {/* Text Content */}
                <motion.div 
                  initial={{ opacity: 0, x: isEven ? 50 : -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className="flex-1 space-y-6 w-full"
                >
                  <div className="flex items-center gap-6 mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-digital-teal/10 text-digital-teal border border-digital-teal/20 flex items-center justify-center shadow-[0_0_30px_rgba(20,241,149,0.15)] shrink-0">
                      <step.icon className="w-8 h-8" />
                    </div>
                    <h3 className="text-3xl md:text-4xl font-bold text-zinc-100">{step.title}</h3>
                  </div>
                  <p className="text-xl text-zinc-400 leading-relaxed">
                    {step.desc}
                  </p>
                </motion.div>

                {/* Visual Content */}
                <motion.div 
                  initial={{ opacity: 0, x: isEven ? -50 : 50, scale: 0.95 }}
                  whileInView={{ opacity: 1, x: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
                  className="flex-1 w-full"
                >
                  <div className="h-[400px] lg:h-[450px] w-full bg-zinc-900/40 rounded-[2.5rem] border border-zinc-800/60 overflow-hidden shadow-2xl relative">
                    {/* 
                      ملاحظة للمطور: إذا أردت استبدال هذه الحركات البرمجية بفيديو حقيقي مستقبلاً، 
                      يمكنك إخفاء <Visual /> ووضع وسم الفيديو هنا مثل:
                      <video src="/step1-video.mp4" autoPlay loop muted playsInline className="w-full h-full object-cover" />
                    */}
                    <Visual />
                  </div>
                </motion.div>

              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
