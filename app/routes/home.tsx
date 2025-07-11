import type { Route } from "./+types/home";
import { BackgroundManager } from "../components/BackgroundManager";
import { TransferForm } from "../components/TransferForm";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "NaijaTransfer - Fast & Secure File Transfer" },
    { name: "description", content: "Send large files quickly and securely with NaijaTransfer" },
  ];
}

export default function Home() {
  return (
    <BackgroundManager>
      {/* WeTransfer-inspired layout */}
      <div className="h-screen overflow-hidden">
        {/* Header Navigation */}
        <header className="relative z-10 p-6">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="text-2xl font-bold text-white">
              naija
            </div>
            
            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-8 text-white">
              <a href="#" className="hover:opacity-80 transition-opacity">Features</a>
              <a href="#" className="hover:opacity-80 transition-opacity">Pricing</a>
              <a href="#" className="hover:opacity-80 transition-opacity">Use cases</a>
              <a href="#" className="hover:opacity-80 transition-opacity">Resources</a>
            </nav>
            
            {/* Auth buttons */}
            <div className="flex items-center space-x-3">
              <button className="text-white hover:opacity-80 transition-opacity px-4 py-2">
                Log in
              </button>
              <button className="bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-900 transition-colors">
                Sign up
              </button>
            </div>
          </div>
        </header>

        {/* Main content area */}
        <div className="flex items-center justify-center h-full px-6 pb-20">
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Left side - Transfer widget */}
            <div className="order-2 lg:order-1">
              <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md mx-auto lg:mx-0">
                <TransferForm />
              </div>
            </div>

            {/* Right side - Headline and CTA */}
            <div className="order-1 lg:order-2 text-center lg:text-left">
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-bold text-white mb-8 leading-tight">
                Need to send big files?
              </h1>
              
              <button className="bg-black text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-900 transition-colors">
                Go Ultimate Now
              </button>
              
              {/* Feature highlights */}
              <div className="mt-12 space-y-4 text-white opacity-90">
                <div className="flex items-center justify-center lg:justify-start space-x-3">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                  <span>Up to 15GB per transfer</span>
                </div>
                <div className="flex items-center justify-center lg:justify-start space-x-3">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                  <span>Files expire after 24 hours</span>
                </div>
                <div className="flex items-center justify-center lg:justify-start space-x-3">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                  <span>100% free to use</span>
                </div>
                <div className="flex items-center justify-center lg:justify-start space-x-3">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                  <span>Real-time progress tracking</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </BackgroundManager>
  );
}
