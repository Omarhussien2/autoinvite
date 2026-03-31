import React from 'react';

export const Footer = () => {
  return (
    <footer className="py-8 px-6 md:px-12 lg:px-24 border-t border-zinc-800/50 text-center text-zinc-500">
      <p>© {new Date().getFullYear()} أوتو إنفايت — صُنع بكل فخر في المملكة العربية السعودية 🇸🇦 جميع الحقوق محفوظة.</p>
    </footer>
  );
};
