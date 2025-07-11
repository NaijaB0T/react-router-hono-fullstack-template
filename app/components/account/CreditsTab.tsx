import { useState, useEffect } from "react";
import { useAuth } from "~/lib/auth";
import { useSearchParams } from "react-router";

interface PaystackResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export function CreditsTab() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [credits, setCredits] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [fundingLoading, setFundingLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Check for payment success parameter
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const reference = searchParams.get('reference');
    
    if (paymentStatus === 'success' && reference) {
      handlePaymentVerification(reference);
      // Clean up URL parameters
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Fetch current credits
  useEffect(() => {
    fetchCredits();
  }, []);

  const handlePaymentVerification = async (reference: string) => {
    try {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reference }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setPaymentSuccess(true);
          fetchCredits(); // Refresh credits balance
          setTimeout(() => setPaymentSuccess(false), 5000); // Hide success message after 5 seconds
        }
      }
    } catch (error) {
      console.error("Error verifying payment:", error);
    }
  };

  const fetchCredits = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/credits", {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_user") ? JSON.parse(localStorage.getItem("auth_user")!).id : ""}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCredits(data.credits || 0);
      }
    } catch (error) {
      console.error("Error fetching credits:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFundAccount = async () => {
    if (!amount || parseFloat(amount) < 100) {
      alert("Minimum funding amount is ₦100");
      return;
    }

    try {
      setFundingLoading(true);
      
      const response = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user?.id}`,
        },
        body: JSON.stringify({
          amount: parseFloat(amount) * 100, // Convert to kobo
          email: user?.email,
        }),
      });

      if (response.ok) {
        const data: PaystackResponse = await response.json();
        if (data.status && data.data?.authorization_url) {
          // Redirect to Paystack payment page
          window.location.href = data.data.authorization_url;
        } else {
          alert("Failed to initialize payment");
        }
      } else {
        alert("Payment initialization failed");
      }
    } catch (error) {
      console.error("Error initializing payment:", error);
      alert("An error occurred while initializing payment");
    } finally {
      setFundingLoading(false);
    }
  };

  const predefinedAmounts = [500, 1000, 2000, 5000, 10000];

  return (
    <div className="text-white">
      <h2 className="text-xl font-semibold mb-6">Credits Management</h2>
      
      {/* Payment Success Message */}
      {paymentSuccess && (
        <div className="bg-green-500/20 border border-green-500 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <span className="text-green-400 text-xl mr-2">✅</span>
            <div>
              <h3 className="font-medium text-green-400">Payment Successful!</h3>
              <p className="text-green-300 text-sm">Your credits have been added to your account.</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Current Credits */}
      <div className="bg-white/10 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Current Balance</h3>
            <p className="text-white/70">1 Credit = ₦1</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-green-400">
              {loading ? "..." : credits.toLocaleString()}
            </div>
            <p className="text-sm text-white/70">Credits</p>
          </div>
        </div>
      </div>

      {/* Fund Account */}
      <div className="bg-white/10 rounded-lg p-6">
        <h3 className="text-lg font-medium mb-4">Fund Your Account</h3>
        
        {/* Predefined amounts */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-white/70 mb-2">
            Quick amounts
          </label>
          <div className="flex flex-wrap gap-2">
            {predefinedAmounts.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset.toString())}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                ₦{preset.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Custom amount */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-white/70 mb-2">
            Custom amount (₦)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            min="100"
            className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-white/50 mt-1">Minimum amount: ₦100</p>
        </div>

        {/* Fund button */}
        <button
          onClick={handleFundAccount}
          disabled={!amount || parseFloat(amount) < 100 || fundingLoading}
          className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          {fundingLoading ? "Processing..." : `Fund Account with ₦${amount ? parseFloat(amount).toLocaleString() : "0"}`}
        </button>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white/10 rounded-lg p-6 mt-6">
        <h3 className="text-lg font-medium mb-4">Recent Transactions</h3>
        <div className="text-center text-white/70 py-8">
          <p>No transactions yet</p>
          <p className="text-sm">Your transaction history will appear here</p>
        </div>
      </div>
    </div>
  );
}