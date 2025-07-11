import { useAuth } from "~/lib/auth";
import { Link } from "react-router";
import { BackgroundManager } from "~/components/BackgroundManager";
import { Header } from "~/components/Header";
import type { Route } from "./+types/auth.register";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Sign Up - Aroko" },
    { name: "description", content: "Create your Aroko account to start managing files and credits." },
  ];
}

export default function Register() {
  const { register } = useAuth();

  return (
    <BackgroundManager>
      <div className="h-screen overflow-hidden">
        <Header />
        
        {/* Main content area */}
        <div className="flex items-center justify-center h-full px-6 pb-20">
          <div className="max-w-md w-full space-y-8 bg-white/10 backdrop-blur-lg rounded-lg p-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white mb-2">Sign Up</h2>
              <p className="text-white/70">Join Aroko</p>
            </div>
            
            <div className="space-y-4">
              <button
                onClick={register}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sign Up with Email
              </button>
              
              <div className="text-center">
                <p className="text-white/70 text-sm">
                  Already have an account?{" "}
                  <Link to="/auth/login" className="text-indigo-300 hover:text-indigo-200">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BackgroundManager>
  );
}