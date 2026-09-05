import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabaseClient";

export default function ResetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!password || !confirmPassword) {
      setMessage("Enter and confirm your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setMessage(error.message || "Unable to update password.");
        return;
      }

      setMessage("Password updated successfully.");

      // Sign out of the recovery session so the user signs in normally.
      await supabase.auth.signOut();

      navigate("/", { replace: true });
    } catch (err) {
      console.error("Password update failed:", err);
      setMessage("Unable to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md p-8 rounded-2xl border shadow-lg bg-white">
        <h2 className="text-2xl font-semibold mb-6 text-center">
          Set New Password
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full p-3 border rounded-lg"
            type="password"
            placeholder="New Password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />

          <input
            className="w-full p-3 border rounded-lg"
            type="password"
            placeholder="Confirm New Password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
          />

          {message && (
            <div
              className="p-3 rounded-lg border text-sm"
              role="alert"
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-black text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Set New Password"}
          </button>
        </form>
      </div>
    </div>
  );
}