<script lang="ts">
    import { onMount } from 'svelte';
    import { markGreetingSeen } from '../reader/position';

    type Props = { onDismiss: () => void };
    let { onDismiss }: Props = $props();

    let shown = $state(false);
    let leaving = $state(false);
    let ctaEl: HTMLButtonElement | undefined = $state();

    onMount(() => {
        // Delay one frame so the class toggle triggers the CSS transition.
        requestAnimationFrame(() => {
            shown = true;
            ctaEl?.focus();
        });
        document.addEventListener('keydown', onKey);
        // Lock background scroll while the overlay is up.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    });

    function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') dismiss();
    }

    function dismiss() {
        markGreetingSeen();
        leaving = true;
        // Match the CSS transition duration before unmounting.
        setTimeout(onDismiss, 260);
    }
</script>

<div
    class="greeting"
    class:shown
    class:leaving
    role="dialog"
    aria-labelledby="greeting-title"
    aria-describedby="greeting-sub"
    aria-modal="true"
>
    <!-- decorative glow -->
    <div class="greeting-aura" aria-hidden="true"></div>

    <div class="greeting-panel">
        <p class="greeting-tag">Tu Biblia mexicana</p>
        <h1 id="greeting-title" class="greeting-title">
            La Biblia en<br />
            <em>tu idioma</em>
        </h1>
        <p id="greeting-sub" class="greeting-sub">
            Más de 130 idiomas de México — escucha, mira y lee las Escrituras
        </p>

        <button
            bind:this={ctaEl}
            type="button"
            class="greeting-cta"
            onclick={dismiss}
        >
            Elegir mi idioma
        </button>
        <p class="greeting-meta">Gratis · sin registro · Audio, video y texto</p>

        <button type="button" class="greeting-secondary" onclick={dismiss}>
            Ver todos los idiomas →
        </button>
    </div>
</div>

<style>
    .greeting {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: grid;
        place-items: center;
        padding: 1.5rem;
        color: #fff;
        background:
            radial-gradient(1200px 800px at 30% 10%, rgba(124, 94, 255, 0.35), transparent 55%),
            radial-gradient(900px 600px at 80% 90%, rgba(200, 169, 81, 0.22), transparent 60%),
            linear-gradient(150deg, #000529 0%, #000b63 45%, #00094f 100%);
        opacity: 0;
        transition: opacity 240ms ease;
    }
    .greeting.shown { opacity: 1; }
    .greeting.leaving { opacity: 0; }

    .greeting-aura {
        position: absolute;
        inset: -20%;
        background: radial-gradient(
            closest-side,
            rgba(255, 255, 255, 0.06),
            transparent 70%
        );
        filter: blur(50px);
        pointer-events: none;
    }

    .greeting-panel {
        position: relative;
        max-width: 680px;
        text-align: center;
        transform: translateY(18px);
        opacity: 0;
        transition:
            transform 520ms cubic-bezier(0.16, 1, 0.3, 1) 80ms,
            opacity 520ms ease 80ms;
    }
    .greeting.shown .greeting-panel {
        transform: translateY(0);
        opacity: 1;
    }

    .greeting-tag {
        display: inline-block;
        padding: 0.3rem 0.75rem;
        border-radius: 999px;
        font-size: 0.75rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.75);
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.14);
        margin-bottom: 1.6rem;
    }

    .greeting-title {
        font-size: clamp(2.6rem, 7vw, 4.8rem);
        line-height: 1.02;
        letter-spacing: -0.035em;
        font-weight: 800;
        margin: 0 0 1.1rem;
        text-shadow: 0 10px 60px rgba(0, 0, 0, 0.35);
    }
    .greeting-title em {
        font-style: italic;
        font-weight: 700;
        background: linear-gradient(120deg, #f0d897 0%, #c8a951 55%, #f6e8be 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }

    .greeting-sub {
        font-size: clamp(1rem, 2.2vw, 1.25rem);
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.82);
        margin: 0 auto 2.3rem;
        max-width: 38ch;
    }

    .greeting-cta {
        appearance: none;
        border: 0;
        cursor: pointer;
        font-weight: 700;
        font-size: 1.05rem;
        letter-spacing: 0.01em;
        padding: 1rem 2.4rem;
        border-radius: 999px;
        color: #000b63;
        background: linear-gradient(120deg, #f6e8be 0%, #c8a951 55%, #e0b85f 100%);
        box-shadow:
            0 18px 40px -12px rgba(200, 169, 81, 0.55),
            0 4px 10px rgba(0, 0, 0, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.35);
        transform: translateZ(0);
        transition: transform 180ms ease, box-shadow 200ms ease;
        animation: greeting-pulse 2.8s ease-in-out 1s infinite;
    }
    .greeting-cta:hover,
    .greeting-cta:focus-visible {
        transform: translateY(-1px) scale(1.02);
        box-shadow:
            0 24px 50px -12px rgba(200, 169, 81, 0.7),
            0 6px 14px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.45);
        outline: none;
    }
    .greeting-cta:active {
        transform: translateY(0) scale(0.995);
    }

    @keyframes greeting-pulse {
        0%, 100% { box-shadow: 0 18px 40px -12px rgba(200, 169, 81, 0.55), 0 4px 10px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 0 0 0 rgba(200, 169, 81, 0.28); }
        50%      { box-shadow: 0 18px 40px -12px rgba(200, 169, 81, 0.55), 0 4px 10px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 0 0 14px rgba(200, 169, 81, 0); }
    }
    @media (prefers-reduced-motion: reduce) {
        .greeting-cta { animation: none; }
        .greeting,
        .greeting-panel {
            transition: opacity 120ms linear;
            transform: none;
        }
    }

    .greeting-meta {
        margin-top: 0.9rem;
        font-size: 0.78rem;
        color: rgba(255, 255, 255, 0.58);
        letter-spacing: 0.02em;
    }

    .greeting-secondary {
        margin-top: 2rem;
        display: inline-block;
        background: transparent;
        border: 0;
        color: rgba(255, 255, 255, 0.72);
        font-size: 0.88rem;
        padding: 0.4rem 0.6rem;
        cursor: pointer;
        border-radius: 8px;
        transition: color 160ms ease, background 160ms ease;
    }
    .greeting-secondary:hover,
    .greeting-secondary:focus-visible {
        color: #fff;
        background: rgba(255, 255, 255, 0.06);
        outline: none;
    }
</style>
