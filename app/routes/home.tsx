import type { Route } from "./+types/home";
import { TransferForm } from "../components/TransferForm";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "NaijaTransfer - Fast & Secure File Transfer" },
    { name: "description", content: "Send files quickly and securely with NaijaTransfer" },
  ];
}

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">NaijaTransfer</h1>
          <p className="text-gray-600 mb-4">Fast, secure file transfer made simple</p>
          <div className="inline-flex items-center space-x-6 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <div className="flex items-center space-x-1">
              <span className="text-green-600">🆓</span>
              <span className="text-green-800 font-medium">100% Free</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-green-600">📦</span>
              <span className="text-green-800">Up to 15GB</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-green-600">⏰</span>
              <span className="text-green-800">24-hour storage</span>
            </div>
          </div>
        </div>
        <TransferForm />
      </div>
    </div>
  );
}
