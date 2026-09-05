import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabaseClient";

export default function Login() {
  const navigate = useNavigate();

  const [isNewUser, setIsNewUser] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  const showError = (text: string) => {
    setMessageIsError(true);
    setMessage(text);
  };

  const showMessage = (text: string) => {
    setMessageIsError(false);
    setMessage(text);
  };

  const clearMessage = () => {
    setMessage("");
    setMessageIsError(false);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      showError("Enter your email address and password.");
      return;
    }

    setLoading(true);
    clearMessage();

    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (signInError) {
        showError(signInError.message || "Unable to sign in.");
        return;
      }

      if (!data.session) {
        showError("Sign in succeeded, but no session was created.");
        return;
      }

      // Remove any legacy development/demo state.
      localStorage.removeItem("demoMode");

      navigate("/", { replace: true });
    } catch (err) {
      console.error("Login failed:", err);
      showError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password || !confirmPassword) {
      showError("Enter your email address and password.");
      return;
    }

    if (password.length < 8) {
      showError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      showError("Passwords do not match.");
      return;
    }

    setLoading(true);
    clearMessage();

    try {
      const { data, error: signUpError } =
        await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

      if (signUpError) {
        showError(
          signUpError.message || "Unable to create account."
        );
        return;
      }

      /*
       * Supabase behavior depends on the project's email-confirmation
       * setting:
       *
       * - If email confirmation is disabled, a session may be returned
       *   immediately.
       * - If email confirmation is enabled, the account is created but
       *   the user must confirm the email before signing in.
       */
      if (data.session) {
        localStorage.removeItem("demoMode");
        navigate("/", { replace: true });
        return;
      }

      setIsNewUser(false);
      setPassword("");
      setConfirmPassword("");

      showMessage(
        "Account created. Check your email to confirm your account, then sign in."
      );
    } catch (err) {
      console.error("Account creation failed:", err);
      showError(
        "Unable to create account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      showError("Enter your email address first.");
      return;
    }

    setLoading(true);
    clearMessage();

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo: "com.capacity.app://reset-password",
          }
        );

      if (resetError) {
        showError(
          resetError.message ||
            "Unable to send password reset email."
        );
        return;
      }

      showMessage(
        "Password reset email sent. Check your email for the recovery link."
      );
    } catch (err) {
      console.error("Password reset failed:", err);
      showError(
        "Unable to send password reset email. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const switchToCreateAccount = () => {
    clearMessage();
    setPassword("");
    setConfirmPassword("");
    setIsNewUser(true);
  };

  const switchToLogin = () => {
    clearMessage();
    setPassword("");
    setConfirmPassword("");
    setIsNewUser(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md p-8 rounded-2xl border shadow-lg bg-white">
        <h2 className="text-2xl font-semibold mb-2 text-center">
          {isNewUser ? "Create HonorPole Account" : "HonorPole Login"}
        </h2>

        {isNewUser && (
          <p className="text-sm text-center text-gray-600 mb-6">
            Create an account to set up and control your HonorPole.
          </p>
        )}

        <form
          onSubmit={
            isNewUser ? handleCreateAccount : handleLogin
          }
          className="space-y-4"
        >
          <input
            className="w-full p-3 border rounded-lg"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />

          <input
            className="w-full p-3 border rounded-lg"
            type="password"
            placeholder="Password"
            autoComplete={
              isNewUser ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />

          {isNewUser && (
            <input
              className="w-full p-3 border rounded-lg"
              type="password"
              placeholder="Confirm Password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              required
            />
          )}

          {message && (
            <div
              className={`p-3 rounded-lg border text-sm ${
                messageIsError
                  ? "border-red-300 bg-red-50 text-red-800"
                  : "border-green-300 bg-green-50 text-green-800"
              }`}
              role={messageIsError ? "alert" : "status"}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-black text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading
              ? isNewUser
                ? "Creating Account..."
                : "Signing in..."
              : isNewUser
                ? "Create Account"
                : "Login"}
          </button>

          {!isNewUser && (
            <>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full py-2 text-sm underline disabled:opacity-50"
              >
                Forgot Password?
              </button>

              <div className="pt-2 border-t text-center">
                <p className="text-sm text-gray-600 mb-2">
                  New to HonorPole?
                </p>

                <button
                  type="button"
                  onClick={switchToCreateAccount}
                  disabled={loading}
                  className="w-full py-3 rounded-lg border border-black font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  New User / Create Account
                </button>
              </div>
            </>
          )}

          {isNewUser && (
            <div className="pt-2 border-t text-center">
              <p className="text-sm text-gray-600 mb-2">
                Already have an HonorPole account?
              </p>

              <button
                type="button"
                onClick={switchToLogin}
                disabled={loading}
                className="w-full py-3 rounded-lg border border-black font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Back to Login
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}