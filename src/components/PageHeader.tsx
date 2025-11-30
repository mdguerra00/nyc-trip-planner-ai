import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, showBack = true, backTo = "/", actions }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="border-b bg-card shadow-soft sticky top-0 z-50 safe-area-pt"
    >
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center gap-3 justify-between">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {showBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(backTo)}
                className="min-w-[44px] min-h-[44px] flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{title}</h1>
              {subtitle && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </motion.header>
  );
}
