import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Mail,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Award,
  CheckCircle2
} from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();

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
    <div className="min-h-screen flex bg-slate-50">

      {/* --- LEFT SIDE: BRANDING & MESSAGE (Hidden on mobile) --- */}
      <div className="hidden lg:flex lg:w-1/2 bg-blue-900 relative overflow-hidden flex-col justify-between p-12 text-white">

        {/* --- BACKGROUND IMAGE & OVERLAYS --- */}
        <div className="absolute inset-0 z-0">
          {/* Imagen de Fondo UDES */}
          <img
            src="https://udes.edu.co/images/antiguas/bucaramanga/2017B/boletindigital/47._UDES.jpg"
            alt="Campus UDES Bucaramanga"
            className="w-full h-full object-cover"
          />
          {/* Capa de tinte azul sólido (Multiplicar) para unificar el color */}
          <div className="absolute inset-0 bg-blue-900/90 mix-blend-multiply"></div>
          {/* Degradado adicional para oscurecer textos y dar profundidad */}
          <div className="absolute inset-0 bg-gradient-to-t from-blue-950 via-blue-900/40 to-blue-900/20"></div>
        </div>

        {/* Abstract Background Shapes (Encima de la imagen para mantener el estilo moderno) */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute top-1/2 right-0 w-80 h-80 bg-emerald-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          {/* Pattern overlay suave */}
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]"></div>
        </div>

        {/* Content (z-10 para asegurar que esté sobre la imagen) */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg flex items-center justify-center shadow-lg">
              <Award className="text-yellow-400 w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight drop-shadow-md">E-Valora UDES</span>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="text-4xl font-bold mb-6 leading-tight drop-shadow-lg">
            Gestión Estratégica del Talento Humano
          </h1>
          <p className="text-blue-50 text-lg leading-relaxed mb-8 drop-shadow-md font-medium">
            Bienvenido al Sistema E-Valora. Una plataforma diseñada para facilitar la autoevaluación y potenciar el desarrollo profesional de nuestro personal administrativo y docente.
          </p>

          <div className="flex gap-4 text-sm font-medium text-blue-100">
            <div className="flex items-center gap-2 bg-blue-950/40 backdrop-blur-sm px-4 py-2 rounded-full border border-blue-400/30 shadow-lg">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Evaluación 360°
            </div>
            <div className="flex items-center gap-2 bg-blue-950/40 backdrop-blur-sm px-4 py-2 rounded-full border border-blue-400/30 shadow-lg">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Resultados en tiempo real
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-blue-200/80 font-medium drop-shadow">
          © 2025 Universidad de Santander. Todos los derechos reservados - E-Valora es un sistema Elaborado por la Oficina de Talento Humano.
        </div>
      </div>

      {/* --- RIGHT SIDE: LOGIN FORM --- */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 relative">
        {/* Mobile Header (Visible only on small screens) */}
        <div className="absolute top-6 left-6 lg:hidden flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-900 rounded-lg flex items-center justify-center">
            <Award className="text-white w-4 h-4" />
          </div>
          <span className="text-lg font-bold text-blue-900">EvalPro</span>
        </div>

        <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">

          <div className="text-center mb-10">
            {/* Logo UDES */}
            <div className="mx-auto w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-blue-700">
              <img
                src="https://udes.edu.co/images/logo/udes-logo-principal.svg"
                alt="Logo UDES"
                className="w-12 h-auto opacity-90"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.innerHTML = '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"></path></svg>';
                }}
              />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Bienvenido de nuevo</h2>
            <p className="text-slate-400 text-sm mt-2">Ingresa tus credenciales para acceder al panel</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Email Input */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 ml-1">Correo Institucional</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  placeholder="ejemplo@udes.edu.co"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-sm font-semibold text-slate-700">Contraseña</label>
                <a href="#" className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-800 hover:to-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  Ingresar al Sistema <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">
              ¿Necesitas ayuda? <a href="#" className="text-blue-600 font-semibold hover:underline">Contacta a soporte</a>
            </p>
          </div>
        </div>

        {/* Mobile footer rights */}
        <div className="absolute bottom-6 text-center lg:hidden">
          <p className="text-xs text-slate-400">© 2025 Universidad de Santander</p>
        </div>
      </div>
    </div>
  );
}
