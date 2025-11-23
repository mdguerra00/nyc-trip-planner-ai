import { Calendar, List, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t sm:hidden z-50 safe-area-pb">
      <div className="flex justify-around items-center h-16">
        <button
          onClick={() => navigate("/")}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            isActive("/") ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <Calendar className="w-5 h-5" />
          <span className="text-xs mt-1">Calendário</span>
        </button>
        
        <button
          onClick={() => navigate("/list")}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            isActive("/list") ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <List className="w-5 h-5" />
          <span className="text-xs mt-1">Lista</span>
        </button>

        <button
          onClick={() => navigate("/profile")}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            isActive("/profile") ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-xs mt-1">Perfil</span>
        </button>
      </div>
    </nav>
  );
}
