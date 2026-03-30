import React from 'react';

const HUMAN_IMG = '/assets/images/hero-human.png';

export const Hero = () => {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ backgroundColor: '#09090b' }}
    >
      {/* ── BACKGROUND IMAGE (right-cropped, blurred) ──────────── */}
      <div
        className="absolute inset-0"
        style={{ zIndex: 0 }}
      >
        <img
          src={HUMAN_IMG}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'right center',
            filter: 'blur(3px) brightness(0.55) saturate(0.85)',
            transform: 'scale(1.04)',
          }}
        />

        {/* Gradient: strong on the right (text side in RTL), fades left */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to left, rgba(9,9,11,0.97) 40%, rgba(9,9,11,0.72) 65%, rgba(9,9,11,0.28) 85%, rgba(9,9,11,0.1) 100%)',
          }}
        />

        {/* Bottom edge fade */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '180px',
            background: 'linear-gradient(to top, #09090b, transparent)',
          }}
        />

        {/* Top edge fade */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '80px',
            background: 'linear-gradient(to bottom, #09090b, transparent)',
          }}
        />

        {/* Teal ambient glow (behind text) */}
        <div
          style={{
            position: 'absolute',
            top: '40%',
            right: '-5%',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 65%)',
            filter: 'blur(40px)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ── TEXT CONTENT (right side in RTL) ────────────────────── */}
      <div
        className="relative w-full"
        style={{ zIndex: 10 }}
      >
        <div
          className="mx-auto px-6 md:px-12 lg:px-20 xl:px-28 py-24"
          style={{ maxWidth: '1400px' }}
        >
          {/* Max-width container for text — sits on the right in RTL */}
          <div style={{ maxWidth: '600px', marginRight: 0, marginLeft: 'auto' }}>

            {/* Badge */}
            <div style={{ marginBottom: '1.5rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  borderRadius: '999px',
                  color: '#10b981',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#10b981',
                    animation: 'pulse 2s infinite',
                    flexShrink: 0,
                  }}
                />
                ذكاء اصطناعي سعودي
              </span>
            </div>

            {/* Main headline */}
            <h1
              style={{
                fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                marginBottom: '1.5rem',
                color: '#fafafa',
              }}
            >
              جهد 3 موظفين.{' '}
              <br />
              <span
                style={{
                  color: '#10b981',
                  textShadow: '0 0 48px rgba(16,185,129,0.4)',
                }}
              >
                يُنجز بضغطة زر.
              </span>
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontSize: 'clamp(1rem, 1.8vw, 1.2rem)',
                color: '#a1a1aa',
                lineHeight: 1.75,
                fontWeight: 300,
                marginBottom: '2.5rem',
                maxWidth: '520px',
              }}
            >
              أوتو انفيت يستبدل النسخ واللصق بذكاء واحد. ينظّف قوائمك، يصمّم دعواتك، ويرسلها بأمان تام.
            </p>

            {/* CTA */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <a
                href="/register"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#10b981',
                  color: '#09090b',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  padding: '14px 28px',
                  borderRadius: '999px',
                  textDecoration: 'none',
                  transition: 'all 0.25s ease',
                  boxShadow: '0 0 32px rgba(16,185,129,0.3)',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#34d399';
                  e.currentTarget.style.boxShadow = '0 0 52px rgba(16,185,129,0.5)';
                  e.currentTarget.style.transform = 'scale(1.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#10b981';
                  e.currentTarget.style.boxShadow = '0 0 32px rgba(16,185,129,0.3)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ابدأ مجاناً
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l-5 5m0 0l5 5m-5-5h12" />
                </svg>
              </a>

              <a
                href="/login"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#a1a1aa',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  padding: '14px 22px',
                  borderRadius: '999px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fafafa';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#a1a1aa';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
              >
                تسجيل الدخول
              </a>
            </div>

            {/* Micro-copy */}
            <p style={{ color: '#52525b', fontSize: '12px', marginTop: '14px' }}>
              بدون بطاقة ائتمان · إلغاء في أي وقت
            </p>

          </div>
        </div>
      </div>

      {/* Scroll nudge */}
      <div
        style={{
          position: 'absolute',
          bottom: '28px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: '10px', color: '#52525b', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          اكتشف المزيد
        </span>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#52525b" strokeWidth={2} style={{ animation: 'bounce 1.5s infinite' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(5px); }
        }
      `}</style>
    </section>
  );
};
