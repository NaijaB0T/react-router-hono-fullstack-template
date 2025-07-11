import { useAuth } from "~/lib/auth";
import { Link } from "react-router";

export default function Login() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8 bg-white/10 backdrop-blur-lg rounded-lg p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">Sign In</h2>
          <p className="text-white/70">Welcome back to NaijaSender</p>
        </div>
        
        <div className="space-y-4">
          <button
            onClick={login}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue with Email
          </button>
          
          <div className="text-center">
            <p className="text-white/70 text-sm">
              Don't have an account?{" "}
              <Link to="/auth/register" className="text-indigo-300 hover:text-indigo-200">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}