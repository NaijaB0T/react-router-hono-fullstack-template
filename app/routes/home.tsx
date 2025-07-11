import type { Route } from "./+types/home";
import { BackgroundManager } from "../components/BackgroundManager";
import { TransferForm } from "../components/TransferForm";
import { Header } from "../components/Header";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Aroko - Ancient Way of Sending Files" },
    { name: "description", content: "Send large files quickly and securely with Aroko - the modern way to share, inspired by ancient Yoruba messaging traditions" },
  ];
}

export default function Home() {
  return (
    <BackgroundManager>
      {/* WeTransfer-inspired layout */}
      <div className="h-screen overflow-hidden">
        <Header />

        {/* Main content area */}
        <div className="flex items-center justify-start h-full px-6 pb-20 pl-12">
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* Left side - Transfer widget */}
            <div className="order-2 lg:order-1 lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-xl p-5 max-w-xs mx-auto lg:mx-0 max-h-[calc(100vh-200px)] overflow-y-auto scrollable-widget">
                <TransferForm />
              </div>
            </div>

            {/* Right side - Headline and CTA */}
            <div className="order-1 lg:order-2 lg:col-span-2 text-center lg:text-left lg:pl-8">
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-white mb-6 leading-tight">
                Need to send big files?
              </h1>
              
              <button className="bg-black text-white px-6 py-3 rounded-lg text-lg font-semibold hover:bg-gray-900 transition-colors font-light">
                Go Ultimate Now
              </button>
              
              {/* Feature highlights */}
              <div className="mt-8 space-y-3 text-white opacity-90 text-sm">
                <div className="flex items-center justify-center lg:justify-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  <span className="font-light">Up to 15GB per transfer</span>
                </div>
                <div className="flex items-center justify-center lg:justify-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  <span className="font-light">Files expire after 24 hours</span>
                </div>
                <div className="flex items-center justify-center lg:justify-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  <span className="font-light">100% free to use</span>
                </div>
                <div className="flex items-center justify-center lg:justify-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  <span className="font-light">Real-time progress tracking</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </BackgroundManager>
  );
}
