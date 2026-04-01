import React from 'react';

export const CTA = () => {
  return (
    <section className="py-32 px-6 md:px-12 lg:px-24 border-t border-zinc-800/50 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-digital-teal/10 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <h2 className="text-5xl md:text-7xl font-black text-zinc-100 mb-8 tracking-tight">
          ابدأ حملتك التالية —<br />
          <span className="text-digital-teal">اليوم، بدون تعقيد.</span>
        </h2>
        <p className="text-2xl text-zinc-400 mb-12 font-light">
          انضم لمئات الشركات السعودية التي وفّرت ساعات عمل أسبوعياً مع أوتو إنفايت.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <a href="/register" className="w-full sm:w-auto bg-digital-teal hover:bg-digital-teal-light text-bg-dark text-xl font-bold py-5 px-12 rounded-full transition-all hover:scale-105">
            جرّب مجاناً — بدون بطاقة
          </a>
          <span className="text-zinc-500">أو</span>
          <a href="https://wa.me/966537276942" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto bg-transparent border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-xl font-medium py-5 px-12 rounded-full transition-all">
            تحدث مع فريقنا
          </a>
        </div>
      </div>
    </section>
  );
};
