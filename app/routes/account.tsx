import { useState } from "react";
import { useAuth } from "~/lib/auth";
import { Navigate } from "react-router";
import { CreditsTab } from "~/components/account/CreditsTab";
import { FilesTab } from "~/components/account/FilesTab";
import { BackgroundManager } from "~/components/BackgroundManager";
import { Header } from "~/components/Header";
import type { Route } from "./+types/account";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Account Management - Aroko" },
    { name: "description", content: "Manage your Aroko account, credits, and settings." },
  ];
}

export default function Account() {
  const { isAuthenticated, user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("files");

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <BackgroundManager>
        <div className="h-screen overflow-hidden">
          <Header />
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-white">Loading...</p>
            </div>
          </div>
        </div>
      </BackgroundManager>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  const tabs = [
    { id: "files", label: "Files", icon: "📁" },
    { id: "credits", label: "Credits", icon: "💳" },
    { id: "profile", label: "Profile", icon: "👤" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <BackgroundManager>
      <div className="h-screen overflow-hidden">
        <Header />
        
        {/* Main content area */}
        <div className="flex items-start justify-center h-full px-6 py-8 overflow-y-auto">
          <div className="w-full max-w-4xl">
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
                {activeTab === "files" && <FilesTab />}
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
    </BackgroundManager>
  );
}