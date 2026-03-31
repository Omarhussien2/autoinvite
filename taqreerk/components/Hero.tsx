import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const HUMAN_IMG = '/assets/images/hero-human.png';
const ROBOT_IMG  = '/assets/images/hero-robot.png';
const WA_LINK = 'https://wa.me/966537276942';

export const Hero = () => {
  const pinRef    = useRef<HTMLDivElement>(null);
  const img1Ref   = useRef<HTMLDivElement>(null);
  const img2Ref   = useRef<HTMLDivElement>(null);
  const text1Ref  = useRef<HTMLDivElement>(null);
  const text2Ref  = useRef<HTMLDivElement>(null);
  const nudgeRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: pinRef.current,
          start: 'top top',
          end: '+=100%',
          scrub: 0.8,
          pin: true,
          anticipatePin: 1,
        },
      });

      tl
        .to(nudgeRef.current, { opacity: 0, y: 10, duration: 0.15 }, 0)
        .to(text1Ref.current, { opacity: 0, y: -50, duration: 0.4, ease: 'power2.in' }, 0.05)
        .to(img1Ref.current, { opacity: 0, scale: 1.08, duration: 0.5, ease: 'power2.inOut' }, 0.1)
        .fromTo(img2Ref.current,
          { opacity: 0, scale: 1.08 },
          { opacity: 1, scale: 1, duration: 0.55, ease: 'power2.out' }, 0.3)
        .fromTo(text2Ref.current,
          { opacity: 0, y: 50 },
          { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 0.55);
    }, pinRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={pinRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        background: '#09090b',
      }}
    >
      {/* ── SCENE 1: Stressed man ── */}
      <div ref={img1Ref} style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <img src={HUMAN_IMG} alt="" aria-hidden="true" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center center',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to left, rgba(9,9,11,0.93) 28%, rgba(9,9,11,0.55) 58%, rgba(9,9,11,0.12) 100%)',
        }} />
      </div>

      {/* ── SCENE 2: Robot ── */}
      <div ref={img2Ref} style={{ position: 'absolute', inset: 0, zIndex: 2, opacity: 0 }}>
        <img src={ROBOT_IMG} alt="" aria-hidden="true" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center center',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, rgba(9,9,11,0.93) 26%, rgba(9,9,11,0.48) 56%, rgba(9,9,11,0.08) 100%)',
        }} />
      </div>

      {/* ── Edge fades ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '90px',
        background: 'linear-gradient(to bottom, #09090b, transparent)',
        zIndex: 8, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '120px',
        background: 'linear-gradient(to top, #09090b, transparent)',
        zIndex: 8, pointerEvents: 'none',
      }} />

      {/* ── TEXT 1 — right side (RTL) ── */}
      <div ref={text1Ref} style={{
        position: 'absolute', inset: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', padding: '0 6vw',
      }}>
        <div style={{ maxWidth: '560px', marginRight: 0, marginLeft: 'auto' }}>
          <div style={{ marginBottom: '1.2rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              padding: '5px 14px',
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: '999px', color: '#10b981',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
            }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#10b981', animation: 'heroPulse 2s infinite', flexShrink: 0,
              }} />
              صُنع في السعودية · شريكك في التسويق الذكي
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(2.4rem, 5vw, 4.8rem)',
            fontWeight: 900, lineHeight: 1.06,
            letterSpacing: '-0.02em', marginBottom: '1.5rem', color: '#fafafa',
          }}>
            حوّل قائمة أسماء
            <br />
            <span style={{ color: '#10b981', textShadow: '0 0 40px rgba(16,185,129,0.35)' }}>
              إلى آلاف الدعوات — في دقائق.
            </span>
          </h1>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: '9px',
              background: '#10b981', color: '#09090b',
              fontWeight: 700, fontSize: '1rem',
              padding: '13px 26px', borderRadius: '999px',
              textDecoration: 'none', transition: 'all 0.22s ease',
              boxShadow: '0 0 28px rgba(16,185,129,0.28)', whiteSpace: 'nowrap',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#34d399'; e.currentTarget.style.transform = 'scale(1.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#10b981'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              ابدأ تجربتك مجاناً
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l-5 5m0 0l5 5m-5-5h12" />
              </svg>
            </a>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              color: '#a1a1aa', fontWeight: 500, fontSize: '0.92rem',
              padding: '13px 20px', borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.1)',
              textDecoration: 'none', transition: 'all 0.2s ease', whiteSpace: 'nowrap',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fafafa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#25d366' }}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              تواصل معنا
            </a>
          </div>
          <p style={{ color: '#52525b', fontSize: '11.5px', marginTop: '14px' }}>
            بدون بطاقة ائتمان · نتائج من أول حملة · إلغاء متى شئت
          </p>
        </div>
      </div>

      {/* ── TEXT 2 — left side (RTL) ── */}
      <div ref={text2Ref} style={{
        position: 'absolute', inset: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', padding: '0 6vw',
        opacity: 0,
      }}>
        <div style={{ maxWidth: '520px', marginLeft: 0, marginRight: 'auto' }}>
          <div style={{ marginBottom: '1rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              padding: '5px 14px',
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.22)',
              borderRadius: '999px', color: '#10b981',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              التسويق الذكي عبر واتساب
            </span>
          </div>

          <h2 style={{
            fontSize: 'clamp(1.8rem, 3.6vw, 3.2rem)',
            fontWeight: 900, lineHeight: 1.12,
            letterSpacing: '-0.02em', marginBottom: '1.2rem', color: '#fafafa',
          }}>
            أوتو إنفايت —{' '}
            <span style={{ color: '#10b981' }}>شريكك التسويقي</span>
            {' '}الأذكى على واتساب.
          </h2>

          <p style={{
            fontSize: 'clamp(0.92rem, 1.5vw, 1.1rem)',
            color: '#a1a1aa', lineHeight: 1.8, fontWeight: 300, marginBottom: '1.8rem',
          }}>
            أرسل آلاف الدعوات الشخصية تلقائياً — دون أن تخاطر بحسابك.
            <br />
            <span style={{ color: '#71717a' }}>بدون جهد، بدون أخطاء، بنتائج قابلة للقياس.</span>
          </p>

          <a href="/register" style={{
            display: 'inline-flex', alignItems: 'center', gap: '9px',
            background: '#10b981', color: '#09090b',
            fontWeight: 700, fontSize: '1rem',
            padding: '13px 26px', borderRadius: '999px',
            textDecoration: 'none', transition: 'all 0.22s ease',
            boxShadow: '0 0 28px rgba(16,185,129,0.28)',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#34d399'; e.currentTarget.style.transform = 'scale(1.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#10b981'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            ابدأ تجربتك المجانية
            <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l-5 5m0 0l5 5m-5-5h12" />
            </svg>
          </a>
        </div>
      </div>

      {/* ── Scroll nudge ── */}
      <div ref={nudgeRef} style={{
        position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
        zIndex: 20, pointerEvents: 'none',
      }}>
        <span style={{ fontSize: '10px', color: '#52525b', letterSpacing: '0.15em' }}>
          اكتشف المزيد
        </span>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#52525b" strokeWidth={2}
          style={{ animation: 'heroBounce 1.5s infinite' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <style>{`
        @keyframes heroPulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes heroBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(5px)} }
      `}</style>
    </section>
  );
};
