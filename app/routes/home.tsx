import type { Route } from "./+types/home";
import { BackgroundManager } from "../components/BackgroundManager";
import { TransferForm } from "../components/TransferForm";
import { Header } from "../components/Header";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Aroko - Ancient Yoruba Way of Sending Files" },
    { name: "description", content: "Send large files with the ancient Yoruba way of messaging. Pay-as-you-use storage from ₦60/month or ₦2/day. Free transfers included!" },
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
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-white mb-4 leading-tight">
                Store & Send Big Files
              </h1>
              <h2 className="text-xl md:text-2xl lg:text-3xl font-light text-white mb-6 opacity-90">
                Pay only for what you use
              </h2>
              
              {/* Pricing highlight */}
              <div className="bg-black bg-opacity-80 backdrop-blur-sm rounded-xl p-4 mb-6 border border-gray-600">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white mb-2">Store 1GB for ₦60/month</div>
                  <div className="text-sm text-gray-300 font-light">Or pay ₦2 per day as you use</div>
                </div>
              </div>
              
              <div className="space-y-3 mb-6">
                <button className="w-full lg:w-auto bg-green-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-green-700 transition-colors font-light">
                  Start Storing Files
                </button>
                <div className="text-center lg:text-left">
                  <span className="text-white text-sm opacity-80 font-light">Free transfers included</span>
                </div>
              </div>
              
              {/* Feature highlights */}
              <div className="mt-6 space-y-3 text-white opacity-90 text-sm">
                <div className="flex items-center justify-center lg:justify-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                  <span className="font-light">Pay-as-you-use pricing</span>
                </div>
                <div className="flex items-center justify-center lg:justify-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                  <span className="font-light">Free file transfers (24hr expiry)</span>
                </div>
                <div className="flex items-center justify-center lg:justify-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                  <span className="font-light">Long-term storage available</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </BackgroundManager>
  );
}
