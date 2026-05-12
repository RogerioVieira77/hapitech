import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";

export function NotificationListener() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const notif = payload.new as any;

          // Show toast
          toast(notif.title, {
            description: notif.message,
            icon: <ArrowRightLeft className="h-4 w-4" />,
            duration: 8000,
          });

          // Desktop notification
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(notif.title, {
              body: notif.message || "",
              icon: "/favicon.png",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
