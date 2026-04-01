import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, MousePointer2, Send, ShieldAlert, Clock, HelpCircle } from 'lucide-react';

const illustrations = {
  data: {
    old: () => (
      <div className="flex flex-col gap-2 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 w-full max-w-[220px] shrink-0">
        <motion.div animate={{ x: [-2, 2, -2] }} transition={{ repeat: Infinity, duration: 0.4 }} className="h-8 bg-red-950/30 border border-red-900/50 rounded-lg flex items-center px-3 gap-2">
          <XCircle className="w-4 h-4 text-red-500/70" />
          <span className="w-16 h-1.5 bg-red-500/30 rounded-full"></span>
        </motion.div>
        <div className="h-8 bg-zinc-900/50 border border-zinc-800/50 rounded-lg flex items-center px-3 gap-2">
          <div className="w-4 h-4 rounded-full bg-zinc-800"></div>
          <span className="w-20 h-1.5 bg-zinc-700 rounded-full"></span>
        </div>
        <motion.div animate={{ x: [-2, 2, -2] }} transition={{ repeat: Infinity, duration: 0.4, delay: 0.2 }} className="h-8 bg-amber-950/30 border border-amber-900/50 rounded-lg flex items-center px-3 gap-2">
          <XCircle className="w-4 h-4 text-amber-500/70" />
          <span className="w-12 h-1.5 bg-amber-500/30 rounded-full"></span>
        </motion.div>
      </div>
    ),
    new: () => (
      <div className="flex flex-col gap-2 p-4 bg-digital-teal/5 rounded-xl border border-digital-teal/20 w-full max-w-[220px] shrink-0">
        {[1, 2, 3].map((i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} className="h-8 bg-digital-teal/10 border border-digital-teal/20 rounded-lg flex items-center px-3 gap-2">
            <CheckCircle2 className="w-4 h-4 text-digital-teal" />
            <span className={`h-1.5 bg-digital-teal/40 rounded-full ${i === 1 ? 'w-16' : i === 2 ? 'w-20' : 'w-12'}`}></span>
          </motion.div>
        ))}
      </div>
    )
  },
  design: {
    old: () => (
      <div className="relative w-full max-w-[220px] h-32 bg-zinc-950/50 rounded-xl border border-zinc-800/50 flex items-center justify-center p-4 shrink-0 overflow-hidden">
        <div className="w-full h-full border border-zinc-800 rounded-lg flex flex-col items-center justify-center gap-3 relative bg-zinc-900/30">
          <div className="w-10 h-10 rounded-full bg-zinc-800"></div>
          <div className="flex items-center bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
            <span className="text-xs text-zinc-500 font-mono">Ahme</span>
            <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-0.5 h-3 bg-zinc-500 ml-0.5"></motion.span>
          </div>
          <motion.div animate={{ x: [0, 15, 0], y: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute bottom-3 right-3">
            <MousePointer2 className="w-5 h-5 text-zinc-500" />
          </motion.div>
        </div>
      </div>
    ),
    new: () => (
      <div className="relative w-full max-w-[220px] h-32 bg-digital-teal/5 rounded-xl border border-digital-teal/20 flex items-center justify-center p-4 shrink-0">
        <div className="relative w-full h-full flex items-center justify-center mt-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: i * 8 }}
              transition={{ delay: i * 0.2, duration: 0.4 }}
              className="absolute top-0 w-3/4 h-16 border border-digital-teal/30 bg-zinc-900 rounded-lg flex flex-col items-center justify-center gap-2 shadow-lg"
              style={{ zIndex: i, transformOrigin: 'top center' }}
            >
              <div className="w-6 h-6 rounded-full bg-digital-teal/20"></div>
              <div className="w-12 h-1.5 bg-digital-teal/40 rounded-full"></div>
            </motion.div>
          ))}
        </div>
      </div>
    )
  },
  sending: {
    old: () => (
      <div className="flex items-center justify-between w-full max-w-[220px] h-32 bg-zinc-950/50 rounded-xl border border-zinc-800/50 p-4 relative overflow-hidden shrink-0">
        <div className="flex flex-col gap-2 z-10 w-full">
          {[0, 1, 2].map(i => (
            <motion.div key={i} animate={{ x: [0, 120] }} transition={{ repeat: Infinity, duration: 0.6, ease: "linear", delay: i * 0.1 }} className="w-8 h-5 bg-zinc-800 rounded-md flex items-center justify-center border border-zinc-700">
              <Send className="w-3 h-3 text-zinc-500" />
            </motion.div>
          ))}
        </div>
        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 0.5 }} className="absolute right-4 w-12 h-12 rounded-full bg-red-950/50 border border-red-900/50 flex items-center justify-center z-10 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
          <ShieldAlert className="w-6 h-6 text-red-500/80" />
        </motion.div>
      </div>
    ),
    new: () => (
      <div className="flex items-center justify-center w-full max-w-[220px] h-32 bg-digital-teal/5 rounded-xl border border-digital-teal/20 p-4 relative overflow-hidden shrink-0">
        <div className="flex items-center justify-center w-full h-full relative">
          <motion.div 
            animate={{ x: [-60, 60], opacity: [0, 1, 0] }} 
            transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }} 
            className="absolute w-10 h-6 bg-digital-teal/10 border border-digital-teal/30 rounded-md flex items-center justify-center"
          >
            <Send className="w-3 h-3 text-digital-teal" />
          </motion.div>
          <div className="w-12 h-12 rounded-full bg-zinc-900 border border-digital-teal/30 flex items-center justify-center z-10 shadow-[0_0_15px_rgba(20,241,149,0.1)]">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 4, ease: "linear" }}>
              <Clock className="w-5 h-5 text-digital-teal" />
            </motion.div>
          </div>
        </div>
      </div>
    )
  },
  tracking: {
    old: () => (
      <div className="flex items-end justify-center gap-3 w-full max-w-[220px] h-32 bg-zinc-950/50 rounded-xl border border-zinc-800/50 p-4 shrink-0 relative">
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <HelpCircle className="w-8 h-8 text-zinc-600/50" />
        </div>
        <div className="w-6 h-10 bg-zinc-800/50 rounded-t-sm border-t border-x border-zinc-700/50"></div>
        <div className="w-6 h-16 bg-zinc-800/50 rounded-t-sm border-t border-x border-zinc-700/50"></div>
        <div className="w-6 h-8 bg-zinc-800/50 rounded-t-sm border-t border-x border-zinc-700/50"></div>
      </div>
    ),
    new: () => (
      <div className="flex items-end justify-center gap-3 w-full max-w-[220px] h-32 bg-digital-teal/5 rounded-xl border border-digital-teal/20 p-4 shrink-0">
        <motion.div initial={{ height: 0 }} animate={{ height: 40 }} transition={{ duration: 1, type: "spring" }} className="w-6 bg-digital-teal/30 rounded-t-sm border-t border-x border-digital-teal/40"></motion.div>
        <motion.div initial={{ height: 0 }} animate={{ height: 60 }} transition={{ duration: 1, delay: 0.1, type: "spring" }} className="w-6 bg-digital-teal/60 rounded-t-sm border-t border-x border-digital-teal/50"></motion.div>
        <motion.div initial={{ height: 0 }} animate={{ height: 80 }} transition={{ duration: 1, delay: 0.2, type: "spring" }} className="w-6 bg-digital-teal rounded-t-sm shadow-[0_0_15px_rgba(20,241,149,0.3)]"></motion.div>
      </div>
    )
  }
};

export const FeaturesBento = () => {
  const [activeTab, setActiveTab] = useState(0);

  const tabs = [
    {
      id: "data",
      title: "تنظيف البيانات",
      today: "تستلم ملف إكسل مليء بالأخطاء. أرقام بدون مفاتيح دول، مسافات زائدة، وأسماء مكررة. تضطر لمراجعتها وتعديلها يدوياً صفاً بصف، مما يستهلك ساعات من وقتك قبل حتى أن تبدأ.",
      withUs: "ارفع الملف كما هو. خوارزمياتنا تتعرف على الأخطاء، تزيل التكرار، وتنسق الأرقام بالصيغة الدولية الصحيحة تلقائياً في ثوانٍ معدودة. بياناتك جاهزة دائماً."
    },
    {
      id: "design",
      title: "تصميم الدعوات",
      today: "يقوم المصمم بفتح برنامج التصميم، ويكتب اسم كل ضيف يدوياً على صورة الدعوة، ثم يحفظها باسمه. عملية بطيئة، مكلفة، ونسبة الخطأ فيها (مثل نسيان حرف) مرتفعة جداً.",
      withUs: "ارفع تصميمك الأساسي مرة واحدة. حدد مكان ظهور الاسم، وسيقوم النظام بتوليد مئات الدعوات المخصصة بأسماء ضيوفك بضغطة زر واحدة وبدقة 100%."
    },
    {
      id: "sending",
      title: "إرسال الرسائل",
      today: "تستخدم برامج إرسال عشوائية ترسل آلاف الرسائل في دقيقة واحدة. النتيجة؟ خوارزميات واتساب تكتشف السلوك الآلي وتقوم بحظر رقمك فوراً، مما يدمر حملتك وسمعتك.",
      withUs: "نستخدم تقنية 'التمهل الذكي'. النظام يترك فواصل زمنية متغيرة ومدروسة بين كل رسالة وأخرى، ليحاكي سلوك الإرسال البشري الطبيعي ويضمن أمان حسابك بنسبة 99%."
    },
    {
      id: "tracking",
      title: "متابعة التقارير",
      today: "بعد الإرسال، أنت في ظلام تام. لا تعرف من استلم رسالتك، من قام بقراءتها، أو أي الأرقام كانت خاطئة. تعتمد على التخمين أو الردود اليدوية لتقييم نجاح حملتك.",
      withUs: "لوحة تحكم حية وشفافة. تتبع حالة كل رسالة (تم الإرسال، تم الاستلام، تم القراءة) في الوقت الفعلي. استخرج تقارير دقيقة وقم بتحسين حملاتك القادمة بناءً على بيانات حقيقية."
    }
  ];

  return (
    <section className="py-32 px-6 md:px-12 lg:px-24 border-t border-zinc-800/50 bg-bg-dark overflow-hidden">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-4xl md:text-6xl font-bold text-zinc-100 mb-20 tracking-tight text-center">
          كل ما تحتاجه في أوتو إنفايت <br />
          <span className="text-zinc-500">— من الرفع إلى التسليم</span>
        </h2>

        <div className="relative">
          {/* Tabs Header */}
          <div className="flex justify-center -mb-px relative z-20 overflow-x-auto hide-scrollbar px-4 pt-4">
            {tabs.map((tab, idx) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(idx)}
                style={{ zIndex: activeTab === idx ? 30 : tabs.length - idx }}
                className={`
                  relative px-6 md:px-10 py-4 text-sm md:text-lg font-bold transition-all duration-300 whitespace-nowrap
                  ${activeTab === idx
                    ? 'bg-zinc-900 text-zinc-100 border-t border-r border-l border-zinc-700 rounded-t-2xl shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.5)]'
                    : 'bg-zinc-950 text-zinc-500 border-t border-r border-l border-zinc-800 rounded-t-2xl hover:text-zinc-300 hover:bg-zinc-900/50 mt-2'
                  }
                  ${idx !== 0 ? '-mr-4 md:-mr-6' : ''}
                `}
              >
                {tab.title}
              </button>
            ))}
          </div>

          {/* Content Card */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-8 md:p-12 relative z-10 shadow-2xl min-h-[400px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -15, filter: 'blur(4px)' }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="space-y-12"
              >
                {/* Today Section */}
                <div className="flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-1 border-r-2 border-zinc-700 pr-6 md:pr-8">
                    <h4 className="text-2xl font-bold text-zinc-100 mb-4">الوضع الحالي</h4>
                    <p className="text-zinc-400 text-lg md:text-xl leading-relaxed">
                      {tabs[activeTab].today}
                    </p>
                  </div>
                  <div className="w-full md:w-auto flex justify-center">
                    {React.createElement(illustrations[tabs[activeTab].id as keyof typeof illustrations].old)}
                  </div>
                </div>

                {/* With Auto Invite Section */}
                <div className="relative flex flex-col md:flex-row items-center gap-8">
                  {/* Subtle glow behind the active section */}
                  <div className="absolute top-1/2 right-0 w-32 h-32 bg-digital-teal/10 rounded-full blur-3xl -translate-y-1/2 pointer-events-none"></div>
                  
                  <div className="flex-1 border-r-2 border-digital-teal pr-6 md:pr-8 relative z-10">
                    <h4 className="text-2xl font-bold text-digital-teal mb-4">مع أوتو إنفايت</h4>
                    <p className="text-zinc-100 text-lg md:text-xl leading-relaxed">
                      {tabs[activeTab].withUs}
                    </p>
                  </div>
                  <div className="w-full md:w-auto flex justify-center relative z-10">
                    {React.createElement(illustrations[tabs[activeTab].id as keyof typeof illustrations].new)}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Decorative Bottom Tab */}
          <div className="flex justify-center -mt-px z-0 relative">
            <div className="bg-zinc-950 border-b border-r border-l border-zinc-800 rounded-b-2xl px-12 py-3 text-zinc-600 font-medium text-sm shadow-inner">
              الطريقة القديمة المُرهِقة
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};

