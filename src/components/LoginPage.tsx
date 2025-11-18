import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    <div className="min-h-screen flex">
      <div className="hidden md:flex w-1/2 bg-teal-700 text-white items-center justify-center p-12">
        <div className="max-w-md text-center">
          <img
            src="https://udes.edu.co/images/logo/udes-logo-principal.svg"
            alt="Logo UDES"
            className="h-24 mx-auto mb-6 opacity-90"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <h2 className="text-2xl font-semibold mb-4">Bienvenido al Sistema E-Valora</h2>
          <p className="text-teal-100/90">
            n la Universidad de Santander, valoramos tu aporte y compromiso. e-Valora es nuestro sistema de Gestión Estratégica del Talento diseñado para la Autoevaluación y Evaluación de Desempeño de todo nuestro personal administrativo y docente.
          </p>

          <div className="mt-8 text-sm text-teal-200">
            <div className="flex items-center justify-center gap-4">
              <a href="#" aria-label="Twitter" className="hover:underline">Twitter</a>
              <a href="#" aria-label="LinkedIn" className="hover:underline">LinkedIn</a>
              <a href="#" aria-label="Facebook" className="hover:underline">Facebook</a>
            </div>
            <div className="mt-6 text-xs">© 2025 -  Derechos Resevados Universidad de Santander, Oficina de Talento Humano.</div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <img
                src="https://udes.edu.co/images/logo/udes-logo-principal.svg"
                alt="Logo UDES"
                className="h-20 mx-auto mb-4"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <p className="text-gray-600">Acceso con correo y contraseña</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingrese su contraseña"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogIn className="w-5 h-5" />
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>

              <div className="text-center mt-3 text-sm">
                <a href="#" className="text-teal-600 hover:underline">¿Olvidó su contraseña?</a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
