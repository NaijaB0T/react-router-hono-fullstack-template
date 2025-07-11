import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { createClient } from "@openauthjs/openauth/client";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [processed, setProcessed] = useState(false);

  useEffect(() => {
    // Prevent multiple executions
    if (processed) return;

    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");
      
      console.log("Auth callback params:", { code: !!code, state, error });
      
      if (error) {
        console.error("Auth error:", error);
        // Clear any stale auth data
        localStorage.removeItem("auth_user");
        navigate("/");
        return;
      }
      
      if (!code) {
        console.error("No authorization code received");
        localStorage.removeItem("auth_user");
        navigate("/");
        return;
      }
      
      if (!state || (state !== "login" && state !== "register")) {
        console.error("Invalid or missing state parameter:", state);
        localStorage.removeItem("auth_user");
        navigate("/");
        return;
      }

      try {
        // Clear any existing auth data to prevent conflicts
        localStorage.removeItem("auth_user");
        console.log("Cleared existing auth data to prevent conflicts");

        // Use OpenAuth client to exchange the code
        const authClient = createClient({
          clientID: "naijasender-webapp",
          issuer: "https://openauth-template.femivideograph.workers.dev",
        });

        const result = await authClient.exchange(code, window.location.origin + "/auth/callback");
        
        if (result.err) {
          throw new Error(`Token exchange failed: ${result.err.message}`);
        }

        // Decode the JWT access token to get user data
        // The JWT contains user info in its payload
        const tokenPayload = JSON.parse(atob(result.tokens.access.split('.')[1]));
        console.log("Token payload:", tokenPayload);
        
        const userData = {
          id: tokenPayload.properties.id,
          email: tokenPayload.properties.email,
        };
        
        console.log("User data extracted:", userData);
        
        // Store user data
        localStorage.setItem("auth_user", JSON.stringify(userData));
        
        // Trigger storage event to notify auth context
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'auth_user',
          newValue: JSON.stringify(userData)
        }));
        
        // Mark as processed
        setProcessed(true);
        
        // Redirect to home without reload
        navigate("/", { replace: true });
        
      } catch (error) {
        console.error("Auth callback failed:", error);
        navigate("/");
      }
    };

    handleCallback();
  }, [searchParams, navigate, processed]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Processing Authentication...</h2>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
      </div>
    </div>
  );
}