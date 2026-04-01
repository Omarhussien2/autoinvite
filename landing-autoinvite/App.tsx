import React, { useEffect, useState } from 'react';
import { motion, useScroll, useSpring, AnimatePresence } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Hero } from './components/Hero';
import { Navbar } from './components/Navbar';
import { FeaturesBento } from './FeaturesBento';
import { Timeline } from './Timeline';
import { Comparison } from './Comparison';
import { FAQ } from './FAQ';
import { CTA } from './CTA';
import { Footer } from './Footer';

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    // Sync Lenis with GSAP ScrollTrigger — official recommended pattern
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);
    };
    window.addEventListener('scroll', handleScroll);

    return () => {
      lenis.destroy();
      gsap.ticker.remove((time) => lenis.raf(time * 1000));
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="w-full min-h-screen bg-bg-dark text-zinc-50 overflow-x-hidden selection:bg-digital-teal selection:text-white" dir="rtl">
      <motion.div
        className="fixed top-0 left-0 right-0 h-0.5 bg-digital-teal origin-right shadow-[0_0_10px_rgba(20,241,149,0.5)]"
        style={{ scaleX, zIndex: 200 }}
      />

      <Navbar />
      <Hero />
      <Comparison />
      <FeaturesBento />
      <Timeline />
      <FAQ />
      <CTA />
      <Footer />

      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            onClick={scrollToTop}
            className="fixed bottom-8 left-8 p-3 bg-zinc-800/80 backdrop-blur-md text-digital-teal border border-zinc-700 rounded-full shadow-lg hover:bg-zinc-700 hover:text-white transition-colors z-50 group"
            aria-label="العودة للأعلى"
          >
            <ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform duration-300" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
