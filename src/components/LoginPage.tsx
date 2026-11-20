import { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';

const BASE = import.meta.env.BASE_URL;
// El PNG blanco va sobre fondos oscuros; el de color, sobre fondos claros.
const LOGO_BLANCO = `${BASE}brand/aluna-blanco.png`;
const LOGO_COLOR = `${BASE}brand/aluna-color.png`;

/** Logo de Aluna con la palabra «Eval» al lado. */
function Brand({ tone }: { tone: 'dark' | 'light' }) {
  const onDark = tone === 'dark';
  return (
    <div className="flex items-center gap-1" data-rise>
      <img
        src={onDark ? LOGO_BLANCO : LOGO_COLOR}
        alt="Aluna UDES"
        className="h-14 w-auto select-none"
        draggable={false}
      />
      <span
        className={`text-[2.15rem] leading-none font-semibold tracking-tight -translate-y-[3px] ${
          onDark ? 'text-white' : 'text-blue-950'
        }`}
      >
        Eval
      </span>
    </div>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);

  // Una sola entrada al cargar. Con «reducir movimiento» no se anima nada y todo queda visible.
  useLayoutEffect(() => {
    const mm = gsap.matchMedia();
    mm.add(
      '(prefers-reduced-motion: no-preference)',
      () => {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
        tl.from('[data-photo]', { scale: 1.07, duration: 1.8, ease: 'power2.out', clearProps: 'transform' }, 0)
          .from('[data-rise]', { autoAlpha: 0, y: 14, duration: 0.75, stagger: 0.08, clearProps: 'transform,opacity,visibility' }, 0.1)
          .from('[data-card]', { autoAlpha: 0, y: 18, duration: 0.7, clearProps: 'transform,opacity,visibility' }, 0.12)
          .from('[data-field]', { autoAlpha: 0, y: 10, duration: 0.55, stagger: 0.07, clearProps: 'transform,opacity,visibility' }, 0.32);
      },
      rootRef.current ?? undefined,
    );
    return () => mm.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn({ email, password });

    if (!result.success) {
      setError(result.error || 'Error al iniciar sesión');
    }

    setLoading(false);
  };

  return (
    <div ref={rootRef} className="min-h-screen flex bg-slate-50 selection:bg-blue-200 selection:text-blue-950">

      {/* --- IZQUIERDA: MARCA Y BIENVENIDA (solo escritorio) --- */}
      <div className="hidden lg:flex lg:w-[52%] bg-blue-950 relative overflow-hidden flex-col justify-between p-14 text-white">

        <div className="absolute inset-0 z-0">
          <img
            data-photo
            src="https://udes.edu.co/images/antiguas/bucaramanga/2017B/boletindigital/47._UDES.jpg"
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div className="absolute inset-0 bg-blue-950/85 mix-blend-multiply"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-blue-950 via-blue-950/55 to-blue-950/25"></div>
        </div>

        <div className="relative z-10">
          <Brand tone="dark" />
        </div>

        <div className="relative z-10 max-w-xl">
          <h1 data-rise className="text-[2.75rem] font-semibold leading-[1.1] tracking-tight text-balance mb-6">
            Evaluaciones de desempeño para la comunidad UDES
          </h1>
          <p data-rise className="text-lg leading-relaxed text-blue-50/90 max-w-[34rem]">
            Te damos la bienvenida a Aluna Eval. Aquí diligencias tus evaluaciones y consultas tus resultados.
          </p>
        </div>

        <div className="relative z-10 space-y-3">
          <p data-rise className="text-base font-medium text-white border-t border-white/25 pt-5 max-w-xl">
            Aluna Eval es un proyecto desarrollado por la Universidad de Santander.
          </p>
          <p data-rise className="text-xs text-blue-100/75">
            © {new Date().getFullYear()} Universidad de Santander. Todos los derechos reservados.
          </p>
        </div>
      </div>

      {/* --- DERECHA: FORMULARIO --- */}
      <div className="w-full lg:w-[48%] flex flex-col items-center justify-center gap-8 p-4 sm:p-8">

        {/* Marca para pantallas pequeñas (fondo claro: logo de color) */}
        <div className="lg:hidden">
          <Brand tone="light" />
        </div>

        <div
          data-card
          className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100"
        >
          <div className="mb-9">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Bienvenido a Aluna Eval</h2>
            <p className="text-slate-500 text-sm mt-2">Ingresa con tu correo institucional para continuar.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            <div data-field className="space-y-2">
              <label htmlFor="login-email" className="text-sm font-semibold text-slate-700 ml-1">
                Correo institucional
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                </div>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600 transition-[border-color,box-shadow] duration-150 font-medium"
                  placeholder="ejemplo@udes.edu.co"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div data-field className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label htmlFor="login-password" className="text-sm font-semibold text-slate-700">
                  Contraseña
                </label>
                <a href="#" className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline underline-offset-2">
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600 transition-[border-color,box-shadow] duration-150 font-medium"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 focus-visible:text-blue-700 focus:outline-none transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">
                {error}
              </div>
            )}

            <div data-field>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-4 rounded-xl shadow-md shadow-blue-900/15 transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" role="status" aria-label="Ingresando"></div>
                ) : (
                  <>
                    Ingresar <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div data-field className="mt-8 pt-6 border-t border-slate-100 text-center space-y-2">
            <p className="text-xs text-slate-500">
              ¿Necesitas ayuda? <a href="#" className="text-blue-700 font-semibold hover:underline underline-offset-2">Contacta a soporte</a>
            </p>
            {/* En pantallas pequeñas no se ve el panel de marca: la autoría va aquí */}
            <p className="text-xs text-slate-500 lg:hidden">
              Aluna Eval es un proyecto desarrollado por la Universidad de Santander.
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-400 lg:hidden">© {new Date().getFullYear()} Universidad de Santander</p>
      </div>
    </div>
  );
}
