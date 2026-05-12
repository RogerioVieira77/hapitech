import { useEffect } from "react";

export default function GmailOAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    
    const storedClientId = sessionStorage.getItem("gmail_oauth_client_id") || "";
    const storedClientSecret = sessionStorage.getItem("gmail_oauth_client_secret") || "";
    if (code && window.opener) {
      window.opener.postMessage({
        type: "gmail-oauth-callback",
        code,
        redirect_uri: `${window.location.origin}/gmail-oauth-callback`,
        client_id: storedClientId,
        client_secret: storedClientSecret,
      }, window.location.origin);
      window.close();
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 mx-auto rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Conectando ao Gmail...</p>
      </div>
    </div>
  );
}
