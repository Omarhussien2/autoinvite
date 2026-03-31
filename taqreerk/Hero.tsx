import React from 'react';
import { motion } from 'motion/react';

export const Hero = () => {
  return (
    <section className="min-h-screen flex flex-col justify-center px-6 md:px-12 lg:px-24 pt-24 pb-12 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_0%_0%,_rgba(16,185,129,0.15)_0%,_transparent_50%)] pointer-events-none"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-5xl z-10"
      >
        <h1 className="text-6xl md:text-8xl lg:text-[120px] font-black leading-[0.9] tracking-tight mb-8">
          قائمة أسماء.<br />
          <span className="text-digital-teal">آلاف الدعوات — في دقائق.</span>
        </h1>

        <p className="text-xl md:text-3xl text-zinc-400 max-w-2xl mb-12 leading-relaxed font-light">
          أوتو إنفايت ينظف بياناتك، يصمم دعواتك الشخصية، ويرسلها بأمان تام — بدون أن تلمس لوحة المفاتيح.
        </p>

        <div className="flex flex-wrap gap-4">
          <a href="/register" className="bg-digital-teal hover:bg-digital-teal-light text-bg-dark text-lg md:text-xl font-bold py-4 px-8 rounded-full transition-all hover:scale-105">
            جرّب مجاناً — بدون بطاقة
          </a>
          <a href="#how-it-works" className="bg-zinc-800 hover:bg-zinc-700 text-white text-lg md:text-xl font-medium py-4 px-8 rounded-full transition-all">
            كيف يعمل؟
          </a>
        </div>
      </motion.div>
    </section>
  );
};
