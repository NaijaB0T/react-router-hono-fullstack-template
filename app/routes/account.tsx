import { useState } from "react";
import { useAuth } from "~/lib/auth";
import { Navigate } from "react-router";
import { CreditsTab } from "~/components/account/CreditsTab";

export default function Account() {
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState("credits");

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  const tabs = [
    { id: "credits", label: "Credits", icon: "💳" },
    { id: "profile", label: "Profile", icon: "👤" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Account Management</h1>
            <p className="text-white/70">Welcome back, {user?.email}</p>
          </div>

          {/* Tabs */}
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
            <div className="flex space-x-1 mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                    activeTab === tab.id
                      ? "bg-indigo-600 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
              {activeTab === "credits" && <CreditsTab />}
              {activeTab === "profile" && (
                <div className="text-white">
                  <h2 className="text-xl font-semibold mb-4">Profile Settings</h2>
                  <p className="text-white/70">Profile management coming soon...</p>
                </div>
              )}
              {activeTab === "settings" && (
                <div className="text-white">
                  <h2 className="text-xl font-semibold mb-4">Account Settings</h2>
                  <p className="text-white/70">Settings management coming soon...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}