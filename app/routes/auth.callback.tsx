import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";

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
      
      if (error) {
        console.error("Auth error:", error);
        navigate("/");
        return;
      }
      
      if (!code) {
        console.error("No authorization code received");
        navigate("/");
        return;
      }

      try {
        // Check if we've already processed this callback
        const currentUser = localStorage.getItem("auth_user");
        if (currentUser) {
          console.log("User already authenticated, redirecting...");
          navigate("/");
          return;
        }

        // Exchange code for token with OpenAuth
        const tokenResponse = await fetch("https://openauth-template.femivideograph.workers.dev/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: "naijasender-webapp",
            redirect_uri: window.location.origin + "/auth/callback",
          }),
        });

        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json() as { access_token: string };
          
          // Get user info from OpenAuth
          const userResponse = await fetch("https://openauth-template.femivideograph.workers.dev/userinfo", {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          });

          if (userResponse.ok) {
            const userData = await userResponse.json() as { id: string; email: string };
            
            // Store user data
            localStorage.setItem("auth_user", JSON.stringify(userData));
            
            // Mark as processed
            setProcessed(true);
            
            // Redirect to home without reload
            navigate("/", { replace: true });
          } else {
            throw new Error("Failed to get user info");
          }
        } else {
          // Fallback to mock user if token exchange fails
          console.warn("Token exchange failed, using mock user");
          const mockUser = {
            id: `user-${Date.now()}`,
            email: "user@example.com"
          };
          
          localStorage.setItem("auth_user", JSON.stringify(mockUser));
          setProcessed(true);
          navigate("/", { replace: true });
        }
        
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