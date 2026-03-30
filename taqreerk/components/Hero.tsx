import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const HUMAN_IMG = '/assets/images/hero-human.png';
const ROBOT_IMG = '/assets/images/hero-robot.png';

export const Hero = () => {
  const wrapperRef  = useRef<HTMLDivElement>(null);

  // Images
  const humanRef    = useRef<HTMLDivElement>(null);
  const robotRef    = useRef<HTMLDivElement>(null);

  // Text panels (absolutely stacked on top of each other)
  const text1Ref    = useRef<HTMLDivElement>(null);
  const text2Ref    = useRef<HTMLDivElement>(null);
  const ctaRef      = useRef<HTMLDivElement>(null);

  // Background glows
  const glow1Ref    = useRef<HTMLDivElement>(null);
  const glow2Ref    = useRef<HTMLDivElement>(null);
  const glowPulseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {

      // ── Set initial states ────────────────────────────────
      gsap.set(robotRef.current,  { opacity: 0, scale: 1.06, filter: 'blur(12px)' });
      gsap.set(text2Ref.current,  { opacity: 0, y: 80 });
      gsap.set(ctaRef.current,    { opacity: 0, y: 48 });
      gsap.set(glow2Ref.current,  { opacity: 0, scale: 0.75 });
      gsap.set(glowPulseRef.current, { opacity: 0 });

      // ── Master scrub timeline (300vh - 100vh = 200vh of scroll) ──
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrapperRef.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1.5,
        },
      });

      // ─────────────────────────────────────────────────────────────
      // PHASE 1  (0 → 45%): Human → Robot crossfade, Text1 arc
      // ─────────────────────────────────────────────────────────────

      // Human image: fade + slight zoom + blur out
      tl.to(humanRef.current, {
        opacity: 0,
        scale: 1.06,
        filter: 'blur(14px)',
        ease: 'power2.inOut',
        duration: 0.42,
      }, 0)

      // Robot image: unblur + settle into place
      .to(robotRef.current, {
        opacity: 1,
        scale: 1,
        filter: 'blur(0px)',
        ease: 'power2.inOut',
        duration: 0.42,
      }, 0)

      // Text 1: enter from below at t=0
      .fromTo(text1Ref.current,
        { opacity: 0, y: 72 },
        { opacity: 1, y: 0, ease: 'power3.out', duration: 0.2 },
        0
      )
      // Text 1: exit upward as transition completes
      .to(text1Ref.current, {
        opacity: 0,
        y: -68,
        ease: 'power2.in',
        duration: 0.18,
      }, 0.28)

      // Subtle base glow dims during crossfade
      .to(glow1Ref.current, {
        opacity: 0.25,
        scale: 1.2,
        duration: 0.45,
      }, 0)

      // ─────────────────────────────────────────────────────────────
      // PHASE 2  (45% → 100%): Robot stabilised — text & CTA arrive
      // ─────────────────────────────────────────────────────────────

      // Ambient center pulse blooms
      .to(glowPulseRef.current, {
        opacity: 0.5,
        scale: 1.35,
        ease: 'power2.out',
        duration: 0.35,
      }, 0.44)

      // Teal corner glow intensifies
      .to(glow2Ref.current, {
        opacity: 1,
        scale: 1.55,
        ease: 'power2.out',
        duration: 0.38,
      }, 0.44)

      // Text 2 slides in from below
      .to(text2Ref.current, {
        opacity: 1,
        y: 0,
        ease: 'power3.out',
        duration: 0.26,
      }, 0.5)

      // CTA button follows with a springy pop
      .to(ctaRef.current, {
        opacity: 1,
        y: 0,
        ease: 'back.out(1.7)',
        duration: 0.22,
      }, 0.6);

    }, wrapperRef);

    return () => ctx.revert();
  }, []);

  return (
    // 300vh: 100vh visible + 200vh of scroll range
    <div ref={wrapperRef} style={{ height: '300vh' }} className="relative">

      {/* ── STICKY PANEL ────────────────────────────────────── */}
      <div className="sticky top-0 h-screen overflow-hidden">

        {/* ── BACKGROUND GLOW LAYER ───────────────────────── */}
        <div className="absolute inset-0 bg-bg-dark pointer-events-none z-0">

          {/* Persistent corner glow (bottom-right) */}
          <div
            ref={glow1Ref}
            className="absolute -bottom-48 -right-48 w-[720px] h-[720px] rounded-full opacity-60"
            style={{
              background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 68%)',
              filter: 'blur(48px)',
            }}
          />

          {/* Robot-phase: ambient centre bloom */}
          <div
            ref={glowPulseRef}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 62%)',
              filter: 'blur(64px)',
            }}
          />

          {/* Robot-phase: teal upper-left accent */}
          <div
            ref={glow2Ref}
            className="absolute -top-72 -left-72 w-[900px] h-[900px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(16,185,129,0.24) 0%, rgba(5,150,105,0.06) 48%, transparent 68%)',
              filter: 'blur(56px)',
            }}
          />

          {/* Grain texture */}
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: '256px 256px',
            }}
          />
        </div>

        {/* ── MAIN CONTENT GRID ───────────────────────────── */}
        {/*  RTL: order-1 → right column, order-2 → left column  */}
        <div className="relative z-10 w-full h-full grid grid-cols-1 lg:grid-cols-2 items-center">

          {/* ── TEXT COLUMN (RIGHT side in RTL) ───────────── */}
          <div
            className="
              flex flex-col justify-center
              px-8 md:px-14 lg:px-16 xl:px-24
              py-16 h-full
              order-2 lg:order-1
            "
          >
            {/* Badge */}
            <div className="mb-6">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-digital-teal/10 border border-digital-teal/25 rounded-full text-digital-teal text-xs font-bold tracking-wider uppercase">
                <span className="w-1.5 h-1.5 bg-digital-teal rounded-full animate-pulse shrink-0" />
                ذكاء اصطناعي سعودي
              </span>
            </div>

            {/* ── Primary headline (always pinned) ───────── */}
            <h1 className="text-[clamp(2.6rem,5.5vw,5rem)] font-black leading-[0.92] tracking-tight mb-10 text-zinc-50">
              جهد موظفيك.{' '}
              <span
                className="text-digital-teal"
                style={{ textShadow: '0 0 40px rgba(16,185,129,0.35)' }}
              >
                بأتمتة ذكية.
              </span>
            </h1>

            {/* ── Swapping text region ─────────────────────
                Both panels are absolutely stacked so GSAP can
                crossfade them without causing layout shift.
            ─────────────────────────────────────────────── */}
            <div className="relative" style={{ minHeight: '15rem' }}>

              {/* TEXT BLOCK 1 — Human phase */}
              <div ref={text1Ref} className="absolute inset-0">
                <p className="text-lg md:text-xl text-zinc-300 leading-relaxed font-light max-w-md mb-6">
                  <span className="text-digital-teal font-semibold">AutoInvite</span> تقلب الموازين.
                  حوّل ساعات العمل اليدوية لإرسال الدعوات والتواصل إلى ثوانٍ معدودة بضغطة زر.
                </p>

                {/* Metric row */}
                <div className="flex items-center gap-5 mt-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-3xl font-black text-digital-teal leading-none">٩٨٪</span>
                    <span className="text-[11px] text-zinc-500">معدل التسليم</span>
                  </div>
                  <div className="w-px h-10 bg-zinc-800" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-3xl font-black text-zinc-100 leading-none">٣٠ث</span>
                    <span className="text-[11px] text-zinc-500">لـ ١٠٠٠ دعوة</span>
                  </div>
                  <div className="w-px h-10 bg-zinc-800" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-3xl font-black text-zinc-100 leading-none">صفر</span>
                    <span className="text-[11px] text-zinc-500">حظر بالتشغيل الذكي</span>
                  </div>
                </div>
              </div>

              {/* TEXT BLOCK 2 + CTA — Robot phase */}
              <div ref={text2Ref} className="absolute inset-0">
                <p className="text-lg md:text-xl text-zinc-300 leading-relaxed font-light max-w-md mb-8">
                  ودع التشغيل اليدوي. استعن بـ{' '}
                  <span className="text-digital-teal font-semibold">'تقريرك'</span>، عميل
                  الذكاء الاصطناعي الذي ينجز العمل بدقة، سرعة، وبلا حظر.
                </p>

                {/* CTA — animated separately for the "pop" feel */}
                <div ref={ctaRef}>
                  <a
                    href="/register"
                    className="
                      group relative inline-flex items-center gap-3
                      bg-digital-teal hover:bg-digital-teal-light
                      text-bg-dark text-base md:text-lg font-bold
                      py-4 px-8 rounded-full
                      transition-all duration-300
                      hover:scale-105 active:scale-95
                      hover:shadow-[0_0_48px_rgba(16,185,129,0.45)]
                    "
                  >
                    أطلق قواك الخفية
                    <svg
                      className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l-5 5m0 0l5 5m-5-5h12" />
                    </svg>
                  </a>
                  <p className="text-zinc-600 text-xs mt-3">
                    بدون بطاقة ائتمان · إلغاء في أي وقت
                  </p>
                </div>
              </div>

            </div>{/* /swapping text region */}
          </div>

          {/* ── IMAGE COLUMN (LEFT side in RTL) ───────────── */}
          <div className="relative h-full w-full order-1 lg:order-2 overflow-hidden">

            {/* Edge gradient masks — seamless merge into dark bg */}
            <div
              className="absolute inset-0 z-10 pointer-events-none"
              style={{
                background:
                  'linear-gradient(to right, transparent 55%, var(--color-bg-dark) 100%)',
              }}
            />
            <div
              className="absolute bottom-0 inset-x-0 h-36 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to top, var(--color-bg-dark), transparent)' }}
            />
            <div
              className="absolute top-0 inset-x-0 h-24 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, var(--color-bg-dark), transparent)' }}
            />

            {/* ── HUMAN image (start state) ─────────────── */}
            <div
              ref={humanRef}
              className="absolute inset-0 will-change-[opacity,transform,filter]"
            >
              <img
                src={HUMAN_IMG}
                alt="موظف سعودي"
                className="w-full h-full object-cover object-center"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement!;
                  parent.style.background =
                    'radial-gradient(ellipse at 45% 48%, rgba(180,130,80,0.28) 0%, rgba(120,80,40,0.08) 45%, rgba(9,9,11,1) 75%)';
                }}
              />
            </div>

            {/* ── ROBOT image (end state) ───────────────── */}
            <div
              ref={robotRef}
              className="absolute inset-0 will-change-[opacity,transform,filter]"
            >
              <img
                src={ROBOT_IMG}
                alt="عميل الذكاء الاصطناعي — تقريرك"
                className="w-full h-full object-cover object-center"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement!;
                  parent.style.background =
                    'radial-gradient(ellipse at 45% 48%, rgba(16,185,129,0.38) 0%, rgba(5,150,105,0.1) 42%, rgba(9,9,11,1) 72%)';
                }}
              />

              {/* Scan-line overlay on robot for a "digital" feel */}
              <div
                className="absolute inset-0 z-[1] pointer-events-none"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(16,185,129,0.04) 3px, rgba(16,185,129,0.04) 4px)',
                  mixBlendMode: 'screen',
                }}
              />
            </div>

            {/* Scroll nudge — visible only in first viewport */}
            <div className="absolute bottom-10 right-1/2 translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none">
              <span className="text-[10px] text-zinc-600 font-medium tracking-[0.2em] uppercase">
                اسحب
              </span>
              <svg
                className="w-4 h-4 text-zinc-700 animate-bounce"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

        </div>{/* /grid */}
      </div>{/* /sticky */}
    </div>
  );
};
