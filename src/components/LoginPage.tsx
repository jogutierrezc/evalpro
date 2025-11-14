import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn } from 'lucide-react';

export function LoginPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [identification, setIdentification] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn(isAdmin ? { email, password } : { identification });

    if (!result.success) {
      setError(result.error || 'Error al iniciar sesión');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <img
              src="https://udes.edu.co/images/logo/udes-logo-principal.svg"
              alt="Logo UDES"
              className="h-20 mx-auto mb-6"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <p className="text-gray-600">
              {isAdmin ? 'Acceso Administrativo' : 'Evaluación de Habilidades Blandas y Perfiles Laborales'}
            </p>
          </div>

          <div className="mb-4">
            <button
              type="button"
              onClick={() => setIsAdmin(!isAdmin)}
              className="w-full text-sm text-blue-600 hover:text-blue-800 underline"
            >
              {isAdmin ? 'Cambiar a modo evaluación' : 'Ingresar como administrador'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {isAdmin ? (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ingrese su correo"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                    disabled={loading}
                  />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="identification" className="block text-sm font-medium text-gray-700 mb-2">
                  Número de Cédula
                </label>
                <input
                  id="identification"
                  type="text"
                  value={identification}
                  onChange={(e) => setIdentification(e.target.value)}
                  placeholder="Ingrese su número de cédula"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                  disabled={loading}
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn className="w-5 h-5" />
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
